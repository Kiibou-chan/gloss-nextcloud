<?php

declare(strict_types=1);

namespace OCA\Gloss\Service;

use OCP\AppFramework\Utility\ITimeFactory;
use OCP\Notification\IManager;
use OCP\Share\IShare;

class SentNotifier {
	public function __construct(private IManager $notifications, private ITimeFactory $time) {
	}

	public function notify(IShare $share, SaveResult $result, string $draft): void {
		$notification = $this->notifications->createNotification()
			->setApp('gloss')
			->setUser($share->getShareOwner())
			->setDateTime($this->time->getDateTime())
			->setObject('review', (string)$result->fileId)
			->setSubject('review_sent', [
				'name' => $result->name,
				'draft' => $draft,
				'fileId' => $result->fileId,
				'path' => $result->path,
			]);
		$this->notifications->notify($notification);
	}
}
