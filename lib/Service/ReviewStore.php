<?php

declare(strict_types=1);

namespace OCA\Gloss\Service;

use OCA\Gloss\Exception\ReviewRefused;
use OCP\Constants;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\NotFoundException;
use OCP\Share\IShare;

/** The spike's storage contract, kept until the read-only review routes replace it. */
class ReviewStore {
	private const MAX_REVIEW_BYTES = 1048576;

	public function load(IShare $share, string $reviewer): array {
		$name = $this->fileName($reviewer);
		if ($name === null) {
			throw new ReviewRefused(400, 'Bad reviewer key.');
		}
		try {
			$file = $this->folder($share)->get('reviews/' . $name);
		} catch (NotFoundException) {
			return ['items' => [], 'sent' => false];
		}
		if (!$file instanceof File) {
			throw new ReviewRefused(409, 'Not a file.');
		}
		return json_decode($file->getContent(), true) ?? ['items' => [], 'sent' => false];
	}

	public function save(IShare $share, string $reviewer, string $review): void {
		if (($share->getPermissions() & Constants::PERMISSION_CREATE) === 0) {
			throw new ReviewRefused(403, 'This link does not allow saving.');
		}
		$name = $this->fileName($reviewer);
		if ($name === null || strlen($review) > self::MAX_REVIEW_BYTES || !is_array(json_decode($review, true))) {
			throw new ReviewRefused(400, 'Bad review.');
		}
		$folder = $this->folder($share);
		$reviews = $folder->nodeExists('reviews') ? $folder->get('reviews') : $folder->newFolder('reviews');
		if (!$reviews instanceof Folder) {
			throw new ReviewRefused(409, 'reviews is not a folder.');
		}
		if ($reviews->nodeExists($name)) {
			$file = $reviews->get($name);
			if (!$file instanceof File) {
				throw new ReviewRefused(409, 'Not a file.');
			}
			$file->putContent($review);
		} else {
			$reviews->newFile($name, $review);
		}
	}

	private function folder(IShare $share): Folder {
		$node = $share->getNode();
		if (!$node instanceof Folder) {
			throw new NotFoundException('The share is not a folder.');
		}
		return $node;
	}

	private function fileName(string $reviewer): ?string {
		return preg_match('/^[a-z0-9-]{1,80}$/', $reviewer) === 1 ? $reviewer . '.json' : null;
	}
}
