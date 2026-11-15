<?php

declare(strict_types=1);

namespace OCA\Gloss\Notification;

use OCP\Files\File;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\IURLGenerator;
use OCP\L10N\IFactory;
use OCP\Notification\AlreadyProcessedException;
use OCP\Notification\INotification;
use OCP\Notification\INotifier;
use OCP\Notification\UnknownNotificationException;

/**
 * review_sent parameters: name (reviewer), draft (draft.file), fileId, and path (the saved review file).
 */
class Notifier implements INotifier {
	public function __construct(private IRootFolder $root, private IURLGenerator $urls, private IFactory $l10n) {
	}

	public function getID(): string {
		return 'gloss';
	}

	public function getName(): string {
		return $this->l10n->get('gloss')->t('gloss');
	}

	public function prepare(INotification $notification, string $languageCode): INotification {
		if ($notification->getApp() !== 'gloss' || $notification->getSubject() !== 'review_sent') {
			throw new UnknownNotificationException();
		}
		$parameters = $notification->getSubjectParameters();
		try {
			$file = $this->root->getUserFolder($notification->getUser())->getFirstNodeById($parameters['fileId']);
		} catch (NotFoundException) {
			throw new AlreadyProcessedException();
		}
		if (!$file instanceof File) {
			throw new AlreadyProcessedException();
		}
		$l10n = $this->l10n->get('gloss', $languageCode);
		$link = $this->urls->linkToRouteAbsolute('files.viewcontroller.showFile', ['fileid' => $parameters['fileId']]);
		return $notification
			->setParsedSubject($l10n->t('%s sent a review of %s', [$parameters['name'], $parameters['draft']]))
			->setRichSubject($l10n->t('{reviewer} sent a review of {draft}'), [
				'reviewer' => ['type' => 'highlight', 'id' => 'reviewer', 'name' => $parameters['name']],
				'draft' => [
					'type' => 'file', 'id' => (string)$parameters['fileId'], 'name' => $parameters['draft'],
					'path' => $parameters['path'], 'link' => $link,
				],
			])
			->setLink($link);
	}
}
