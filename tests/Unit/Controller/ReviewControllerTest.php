<?php

declare(strict_types=1);

namespace OCA\Gloss\Tests\Unit\Controller;

use OCA\Gloss\Controller\ReviewController;
use OCA\Gloss\Exception\ReviewRefused;
use OCA\Gloss\Service\DraftLocator;
use OCA\Gloss\Service\ReviewStore;
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
		$controller = new ReviewController('gloss', $this->createMock(IRequest::class), $this->createMock(ISession::class), $manager, $this->createMock(IURLGenerator::class), new DraftLocator(), $store ?? new ReviewStore());
		$controller->setToken('synthetic-link');
		return $controller;
	}

	public function testDraftAndLegacyText(): void {
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
		self::assertSame(['name' => 'paper.typ', 'text' => 'Synthetic draft.', 'etag' => 'synthetic-etag'], $controller->text()->getData());
	}

	public function testMissingDraftAndPdf(): void {
		$folder = $this->createMock(Folder::class);
		$folder->method('getDirectoryListing')->willReturn([]);
		$controller = $this->controller($folder);
		foreach ([$controller->draft(), $controller->text(), $controller->pdf()] as $response) {
			self::assertSame(404, $response->getStatus());
		}
	}

	public function testLoadAndSaveDelegate(): void {
		$share = $this->createMock(IShare::class);
		$store = $this->createMock(ReviewStore::class);
		$body = '{"items":[],"sent":false}';
		$store->expects(self::once())->method('load')->with($share, 'ada-123')->willReturn(['items' => [], 'sent' => false]);
		$store->expects(self::once())->method('save')->with($share, 'ada-123', $body);
		$controller = $this->controller($this->createMock(Folder::class), $store, $share);
		self::assertSame(['items' => [], 'sent' => false], $controller->load('ada-123')->getData());
		$response = $controller->save('ada-123', $body);
		self::assertSame(200, $response->getStatus());
		self::assertSame(['saved' => true], $response->getData());
	}

	public static function refusals(): array {
		return [['load', 400], ['load', 409], ['save', 400], ['save', 403], ['save', 409]];
	}

	#[DataProvider('refusals')]
	public function testMapsRefusal(string $method, int $status): void {
		$store = $this->createMock(ReviewStore::class);
		$store->method($method)->willThrowException(new ReviewRefused($status, 'Synthetic refusal.'));
		$controller = $this->controller($this->createMock(Folder::class), $store);
		$response = $method === 'load' ? $controller->load('ada') : $controller->save('ada', '{}');
		self::assertSame($status, $response->getStatus());
		self::assertSame(['error' => 'Synthetic refusal.'], $response->getData());
	}

	public function testDraftRouteAndLegacyRoutes(): void {
		$routes = (require dirname(__DIR__, 3) . '/appinfo/routes.php')['routes'];
		self::assertContains(['name' => 'review#draft', 'url' => '/r/{token}/draft', 'verb' => 'GET'], $routes);
		foreach ([['review#text', '/text', 'GET'], ['review#load', '/review', 'GET'], ['review#save', '/review', 'POST']] as [$name, $path, $verb]) {
			self::assertContains(['name' => $name, 'url' => '/r/{token}' . $path, 'verb' => $verb], $routes);
		}
	}
}
