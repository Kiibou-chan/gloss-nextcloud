<?php

declare(strict_types=1);

namespace OCA\Gloss\Tests\Unit\Service;

use OCA\Gloss\Service\SaveResult;
use OCA\Gloss\Service\SentNotifier;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\Notification\IManager;
use OCP\Notification\INotification;
use OCP\Share\IShare;
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\DataProvider;
use Psr\Log\LoggerInterface;

final class SentNotifierTest extends TestCase {
	public static function notificationFailures(): array {
		return [
			'delivery' => ['notify', new \RuntimeException('Synthetic reviewer text must stay out of the log message.')],
			'construction' => ['createNotification', new \Error('Synthetic construction failure.')],
		];
	}

	#[DataProvider('notificationFailures')]
	public function testNotificationFailureIsLoggedAndDoesNotEscape(string $method, \Throwable $exception): void {
		$share = $this->createMock(IShare::class);
		$share->method('getShareOwner')->willReturn('synthetic-owner');
		$manager = $this->createMock(IManager::class);
		if ($method === 'notify') {
			$notification = $this->createMock(INotification::class);
			foreach (['setApp', 'setUser', 'setDateTime', 'setObject', 'setSubject'] as $setter) {
				$notification->method($setter)->willReturnSelf();
			}
			$manager->method('createNotification')->willReturn($notification);
		} else {
			$manager->expects(self::never())->method('notify');
		}
		$manager->expects(self::once())->method($method)->willThrowException($exception);
		$logger = $this->createMock(LoggerInterface::class);
		$logger->expects(self::once())->method('error')->with('Failed to send review notification.', ['exception' => $exception]);
		(new SentNotifier($manager, $this->createMock(ITimeFactory::class), $logger))->notify(
			$share,
			new SaveResult(2, true, 42, '/synthetic/review.json', 'Synthetic reviewer'),
			'paper.typ',
		);
	}

	public function testSendsOneNotificationToOwnerWithReviewMetadataAndServerTime(): void {
		$share = $this->createMock(IShare::class);
		$share->method('getShareOwner')->willReturn('synthetic-owner');
		$notification = $this->createMock(INotification::class);
		$notification->expects(self::once())->method('setApp')->with('gloss')->willReturnSelf();
		$notification->expects(self::once())->method('setUser')->with('synthetic-owner')->willReturnSelf();
		$notification->expects(self::once())->method('setObject')->with('review', '42')->willReturnSelf();
		$notification->expects(self::once())->method('setSubject')->with('review_sent', [
			'name' => 'Ada', 'draft' => 'paper.typ', 'fileId' => 42, 'path' => '/synthetic-owner/files/Review reviews/ada.json',
		])->willReturnSelf();
		$now = new \DateTime('2026-11-15T20:00:00Z');
		$notification->expects(self::once())->method('setDateTime')->with($now)->willReturnSelf();
		$time = $this->createMock(ITimeFactory::class);
		$time->method('getDateTime')->willReturn($now);
		$manager = $this->createMock(IManager::class);
		$manager->expects(self::once())->method('createNotification')->willReturn($notification);
		$manager->expects(self::once())->method('notify')->with($notification);
		$logger = $this->createMock(LoggerInterface::class);
		$logger->expects(self::never())->method('error');
		(new SentNotifier($manager, $time, $logger))->notify($share, new SaveResult(2, true, 42, '/synthetic-owner/files/Review reviews/ada.json', 'Ada'), 'paper.typ');
	}
}
