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

final class SentNotifierTest extends TestCase {
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
		(new SentNotifier($manager, $time))->notify($share, new SaveResult(2, true, 42, '/synthetic-owner/files/Review reviews/ada.json', 'Ada'), 'paper.typ');
	}
}
