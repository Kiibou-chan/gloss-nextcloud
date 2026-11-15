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
	private function controller(Folder $folder, ?ReviewStore $store = null, ?IShare $share = null): ReviewController {
		$share ??= $this->createMock(IShare::class);
		$share->method('getNode')->willReturn($folder);
		$manager = $this->createMock(IManager::class);
		$manager->method('getShareByToken')->with('synthetic-link')->willReturn($share);
		$controller = new ReviewController('gloss', $this->createMock(IRequest::class), $this->createMock(ISession::class), $manager, $this->createMock(IURLGenerator::class), new DraftLocator(), $store ?? $this->createMock(ReviewStore::class));
		$controller->setToken('synthetic-link');
		return $controller;
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

	public function testMissingDraftAndPdf(): void {
		$folder = $this->createMock(Folder::class);
		$folder->method('getDirectoryListing')->willReturn([]);
		$controller = $this->controller($folder);
		foreach ([$controller->draft(), $controller->pdf()] as $response) {
			self::assertSame(404, $response->getStatus());
		}
	}

	public function testOpenAndSaveDelegate(): void {
		$share = $this->createMock(IShare::class);
		$store = $this->createMock(ReviewStore::class);
		$body = '{"format":1,"revision":2,"name":"Ada","items":[],"sent":false}';
		$key = 'AbCdEf0123456789';
		$store->expects(self::once())->method('open')->with($share, ReviewKey::parse($key))->willReturn(new StoredReview($body, 2));
		$store->expects(self::once())->method('save')->with($share, ReviewKey::parse($key), $body, 1)->willReturn(new SaveResult(2, false, 42, '/synthetic/review.json', 'Ada'));
		$controller = $this->controller($this->createMock(Folder::class), $store, $share);
		self::assertSame(['review' => json_decode($body, true), 'revision' => 2], $controller->open($key)->getData());
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
		$controller = $this->controller($this->createMock(Folder::class), $store);
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

	public function testOnlyR20RoutesRemain(): void {
		$routes = (require dirname(__DIR__, 3) . '/appinfo/routes.php')['routes'];
		self::assertSame([
			['name' => 'review#page', 'url' => '/r/{token}', 'verb' => 'GET'],
			['name' => 'review#draft', 'url' => '/r/{token}/draft', 'verb' => 'GET'],
			['name' => 'review#pdf', 'url' => '/r/{token}/pdf', 'verb' => 'GET'],
			['name' => 'review#open', 'url' => '/r/{token}/review/open', 'verb' => 'POST'],
			['name' => 'review#save', 'url' => '/r/{token}/review', 'verb' => 'POST'],
		], $routes);
	}
}
