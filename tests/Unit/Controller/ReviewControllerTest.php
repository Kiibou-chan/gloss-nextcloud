<?php

declare(strict_types=1);

namespace OCA\Gloss\Tests\Unit\Controller;

use OCA\Gloss\Controller\ReviewController;
use OCA\Gloss\Exception\ReviewRefused;
use OCA\Gloss\Service\DraftLocator;
use OCA\Gloss\Service\ReviewStore;
use OCA\Gloss\Service\ReviewKey;
use OCA\Gloss\Service\StoredReview;
use OCA\Gloss\Service\SaveResult;
use OCA\Gloss\Service\SentNotifier;
use OCP\AppFramework\Http\Attribute\BruteForceProtection;
use OCP\AppFramework\Http\Attribute\AnonRateLimit;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\IRequest;
use OCP\ISession;
use OCP\IURLGenerator;
use OCP\Share\IManager;
use OCP\Share\IShare;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class ReviewControllerTest extends TestCase {
	private function controller(Folder $folder, ?ReviewStore $store = null, ?IShare $share = null, ?SentNotifier $notifier = null): ReviewController {
		$share ??= $this->createMock(IShare::class);
		$share->method('getNode')->willReturn($folder);
		$manager = $this->createMock(IManager::class);
		$manager->method('getShareByToken')->with('synthetic-link')->willReturn($share);
		$controller = new ReviewController('gloss', $this->createMock(IRequest::class), $this->createMock(ISession::class), $manager, $this->createMock(IURLGenerator::class), new DraftLocator(), $store ?? $this->createMock(ReviewStore::class), $notifier ?? $this->createMock(SentNotifier::class));
		$controller->setToken('synthetic-link');
		return $controller;
	}

	public function testPasswordlessLinksStayAuthenticatedWithoutSession(): void {
		$controller = $this->controller($this->createMock(Folder::class));
		self::assertTrue($controller->isAuthenticated());
	}

	public function testInteractiveControllerAndPasswordForm(): void {
		$controller = $this->controller($this->createMock(Folder::class));
		self::assertInstanceOf(\OCP\AppFramework\AuthPublicShareController::class, $controller);
		$form = $controller->showAuthenticate();
		self::assertSame('authenticate', $form->getTemplateName());
		self::assertFalse($form->getParams()['wrongpw']);
	}

	public function testPasswordVerificationAndRedirect(): void {
		$share = $this->createMock(IShare::class);
		$share->method('getPassword')->willReturn('synthetic-hash');
		$share->method('getNode')->willReturn($this->createMock(Folder::class));
		$manager = $this->createMock(IManager::class);
		$manager->method('getShareByToken')->willReturn($share);
		$manager->expects(self::exactly(2))->method('checkPassword')->with($share, self::anything())->willReturn(false, true);
		$session = $this->createMock(ISession::class);
		$session->expects(self::once())->method('regenerateId')->with(true, true);
		$session->expects(self::once())->method('set')->with('public_link_authenticated_frontend', '{"synthetic-link":"synthetic-hash"}');
		$urls = $this->createMock(IURLGenerator::class);
		$urls->expects(self::exactly(2))->method('linkToRoute')->willReturnCallback(static function (string $route, array $params): string {
			self::assertContains($route, ['gloss.review.authenticate', 'gloss.Review.showShare']);
			self::assertSame(['token' => 'synthetic-link'], $params);
			return '/apps/gloss/r/synthetic-link/view';
		});
		$controller = new ReviewController('gloss', $this->createMock(IRequest::class), $session, $manager, $urls, new DraftLocator(), $this->createMock(ReviewStore::class), $this->createMock(SentNotifier::class));
		$controller->setToken('synthetic-link');
		self::assertTrue($controller->authenticate('wrong-synthetic')->getParams()['wrongpw']);
		$response = $controller->authenticate('correct-synthetic');
		self::assertInstanceOf(\OCP\AppFramework\Http\RedirectResponse::class, $response);
	}

	public function testApiLapseDoesNotRedirectOrStoreRequestBody(): void {
		foreach (['page', 'showShare', 'showAuthenticate', 'authenticate', 'draft', 'pdf', 'open', 'save'] as $action) {
			foreach ([false, true] as $authenticated) {
				$request = $this->createMock(IRequest::class);
				$request->method('getParam')->with('_route')->willReturn('gloss.review.' . $action);
				$session = $this->createMock(ISession::class);
				$session->method('get')->willReturn($authenticated ? '{"synthetic-link":"synthetic-hash"}' : null);
				$session->expects(self::never())->method('set');
				$share = $this->createMock(IShare::class);
				$share->method('getPassword')->willReturn('synthetic-hash');
				$manager = $this->createMock(IManager::class);
				$manager->method('getShareByToken')->willReturn($share);
				$controller = new ReviewController('gloss', $request, $session, $manager, $this->createMock(IURLGenerator::class), new DraftLocator(), $this->createMock(ReviewStore::class), $this->createMock(SentNotifier::class));
				$controller->setToken('synthetic-link');
				try {
					self::assertSame($authenticated, $controller->isAuthenticated());
					self::assertTrue($authenticated || !in_array($action, ['draft', 'pdf', 'open', 'save'], true));
				} catch (\OCP\Files\NotFoundException) {
					self::assertFalse($authenticated);
					self::assertContains($action, ['draft', 'pdf', 'open', 'save']);
				}
			}
		}
	}

	public function testOnlyNewSendNotifiesAndLandedRetryDoesNot(): void {
		$share = $this->createMock(IShare::class);
		$store = $this->createMock(ReviewStore::class);
		$draftSave = new SaveResult(1, false, 42, '/owner/files/Review reviews/ada.json', 'Ada', 'paper.typ');
		$send = new SaveResult(2, true, 42, $draftSave->path, 'Ada', 'chapter.typ');
		$retry = new SaveResult(2, false, 42, $draftSave->path, 'Ada', 'chapter.typ');
		$store->expects(self::exactly(3))->method('save')->willReturn($draftSave, $send, $retry);
		$notifier = $this->createMock(SentNotifier::class);
		$notifier->expects(self::once())->method('notify')->with($share, $send);
		$controller = $this->controller($this->createMock(Folder::class), $store, $share, $notifier);
		$body = '{"format":1,"revision":2,"name":"Ada","draft":{"file":"paper.typ"},"items":[],"sent":true}';
		self::assertSame(['revision' => 1], $controller->save('AbCdEf0123456789', str_replace(['true', '"revision":2'], ['false', '"revision":1'], $body), 0)->getData());
		// Drop the Send's answer, then resend exactly the same body and base revision.
		$controller->save('AbCdEf0123456789', $body, 1);
		self::assertSame(['revision' => 2], $controller->save('AbCdEf0123456789', $body, 1)->getData());
	}

	public function testDraft(): void {
		$file = $this->createMock(File::class);
		$file->method('getName')->willReturn('paper.typ');
		$file->method('getContent')->willReturn('Synthetic draft.');
		$file->method('getEtag')->willReturn('synthetic-etag');
		$folder = $this->createMock(Folder::class);
		$folder->method('getDirectoryListing')->willReturn([$file]);
		$controller = $this->controller($folder);
		$response = $controller->draft();
		self::assertSame(200, $response->getStatus());
		self::assertSame(['main' => 'paper.typ', 'files' => [['file' => 'paper.typ', 'text' => 'Synthetic draft.', 'etag' => 'synthetic-etag']]], $response->getData());
	}

	public function testLandedSendStillSucceedsWhenNotificationDeliveryThrows(): void {
		$store = $this->createMock(ReviewStore::class);
		$store->expects(self::once())->method('save')->willReturn(new SaveResult(2, true, 42, '/synthetic/review.json', 'Ada', 'paper.typ'));
		$manager = $this->createMock(\OCP\Notification\IManager::class);
		$manager->expects(self::once())->method('createNotification')->willThrowException(new \Error('Synthetic notification failure.'));
		$logger = $this->createMock(\Psr\Log\LoggerInterface::class);
		$logger->expects(self::once())->method('error');
		$notifier = new SentNotifier($manager, $this->createMock(\OCP\AppFramework\Utility\ITimeFactory::class), $logger);
		$controller = $this->controller($this->createMock(Folder::class), $store, null, $notifier);
		$response = $controller->save('AbCdEf0123456789', '{"draft":{"file":"paper.typ"},"sent":true}', 1);
		self::assertSame(200, $response->getStatus());
		self::assertSame(['revision' => 2], $response->getData());
	}

	public function testMissingDraftAndPdf(): void {
		$folder = $this->createMock(Folder::class);
		$folder->method('getDirectoryListing')->willReturn([]);
		$controller = $this->controller($folder);
		foreach ([$controller->draft(), $controller->pdf()] as $response) {
			self::assertSame(404, $response->getStatus());
		}
	}

	public function testOpenKeepsExactStoredWhitespaceAndEscapes(): void {
		$body = '{ "format":1, "revision":2, "name":"Ada", "items":[], "text":"\\u0061" }';
		$store = $this->createMock(ReviewStore::class);
		$store->method('open')->willReturn(new StoredReview($body, 2));
		$response = $this->controller($this->createMock(Folder::class), $store)->open('AbCdEf0123456789');
		self::assertSame($body, $response->getData()['rawReview'] ?? null);
	}

	public function testOpenAndSaveDelegate(): void {
		$share = $this->createMock(IShare::class);
		$store = $this->createMock(ReviewStore::class);
		$body = '{"format":1,"revision":2,"name":"Ada","items":[],"sent":false}';
		$key = 'AbCdEf0123456789';
		$store->expects(self::once())->method('open')->with($share, ReviewKey::parse($key))->willReturn(new StoredReview($body, 2));
		$store->expects(self::once())->method('save')->with($share, ReviewKey::parse($key), $body, 1)->willReturn(new SaveResult(2, false, 42, '/synthetic/review.json', 'Ada', 'paper.typ'));
		$controller = $this->controller($this->createMock(Folder::class), $store, $share);
		self::assertSame(['review' => json_decode($body, true), 'revision' => 2, 'rawReview' => $body], $controller->open($key)->getData());
		$response = $controller->save($key, $body, 1);
		self::assertSame(200, $response->getStatus());
		self::assertSame(['revision' => 2], $response->getData());
		self::assertFalse($response->isThrottled());
	}

	public function testUnknownKeyIsOrdinaryUnthrottledAnswer(): void {
		$store = $this->createMock(ReviewStore::class);
		$store->method('open')->willReturn(null);
		$response = $this->controller($this->createMock(Folder::class), $store)->open('AbCdEf0123456789');
		self::assertSame(200, $response->getStatus());
		self::assertSame(['review' => null], $response->getData());
		self::assertFalse($response->isThrottled());
	}

	public static function refusals(): array {
		$rows = [];
		foreach (['open', 'save'] as $action) {
			foreach ([[400, 'badReview'], [403, 'notReviewable'], [409, 'reviewsBlocked'], [409, 'full'], [409, 'sent'], [409, 'conflict'], [413, 'tooLarge'], [423, 'busy']] as [$status, $code]) {
				$rows[] = [$action, $status, $code];
			}
		}
		return $rows;
	}

	#[DataProvider('refusals')]
	public function testMapsRefusal(string $method, int $status, string $code): void {
		$store = $this->createMock(ReviewStore::class);
		$store->method($method)->willThrowException(new ReviewRefused($status, $code, $code === 'conflict' ? 7 : null));
		$notifier = $this->createMock(SentNotifier::class);
		$notifier->expects(self::never())->method('notify');
		$controller = $this->controller($this->createMock(Folder::class), $store, null, $notifier);
		$response = $method === 'open' ? $controller->open('AbCdEf0123456789') : $controller->save('AbCdEf0123456789', '{}', 0);
		self::assertSame($status, $response->getStatus());
		$expected = ['error' => $code];
		if ($code === 'conflict') { $expected['revision'] = 7; }
		self::assertSame($expected, $response->getData());
		self::assertFalse($response->isThrottled());
	}

	public function testMalformedKeysDoNotReachStoreAndActionsHaveNoThrottle(): void {
		$store = $this->createMock(ReviewStore::class);
		$store->expects(self::never())->method('open');
		$store->expects(self::never())->method('save');
		$controller = $this->controller($this->createMock(Folder::class), $store);
		foreach (['open', 'save'] as $method) {
			$response = $method === 'open' ? $controller->open('../bad') : $controller->save('../bad', '{}', 0);
			self::assertSame(400, $response->getStatus());
			self::assertSame(['error' => 'badKey'], $response->getData());
			self::assertFalse($response->isThrottled());
			$reflection = new \ReflectionMethod(ReviewController::class, $method);
			self::assertSame([], $reflection->getAttributes(BruteForceProtection::class));
			self::assertSame([], $reflection->getAttributes(AnonRateLimit::class));
		}
	}

	public function testReviewAndAuthenticationRoutes(): void {
		$routes = (require dirname(__DIR__, 3) . '/appinfo/routes.php')['routes'];
		self::assertSame([
			['name' => 'review#page', 'url' => '/r/{token}', 'verb' => 'GET'],
			['name' => 'review#showShare', 'url' => '/r/{token}/view', 'verb' => 'GET'],
			['name' => 'review#showAuthenticate', 'url' => '/r/{token}/authenticate', 'verb' => 'GET'],
			['name' => 'review#authenticate', 'url' => '/r/{token}/authenticate', 'verb' => 'POST'],
			['name' => 'review#draft', 'url' => '/r/{token}/draft', 'verb' => 'GET'],
			['name' => 'review#pdf', 'url' => '/r/{token}/pdf', 'verb' => 'GET'],
			['name' => 'review#open', 'url' => '/r/{token}/review/open', 'verb' => 'POST'],
			['name' => 'review#save', 'url' => '/r/{token}/review', 'verb' => 'POST'],
		], $routes);
	}
}
