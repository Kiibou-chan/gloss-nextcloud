<?php

declare(strict_types=1);

namespace OCA\Gloss\Service;

use OCP\AppFramework\Utility\ITimeFactory;
use OCP\Notification\IManager;
use OCP\Share\IShare;
use Psr\Log\LoggerInterface;

class SentNotifier {
	public function __construct(private IManager $notifications, private ITimeFactory $time, private LoggerInterface $logger) {
	}

	public function notify(IShare $share, SaveResult $result): void {
		try {
			$notification = $this->notifications->createNotification()
				->setApp('gloss')
				->setUser($share->getShareOwner())
				->setDateTime($this->time->getDateTime())
				->setObject('review', (string)$result->fileId)
				->setSubject('review_sent', [
					'name' => $result->name,
					'draft' => $result->draftFile,
					'fileId' => $result->fileId,
					'path' => $result->path,
				]);
			$this->notifications->notify($notification);
		} catch (\Throwable $e) {
			$this->logger->error('Failed to send review notification.', ['exception' => $e]);
		}
	}
}
