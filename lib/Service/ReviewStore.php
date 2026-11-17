<?php

declare(strict_types=1);

namespace OCA\Gloss\Service;

use OCA\Gloss\Exception\ReviewRefused;
use OCP\Constants;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\Lock\ILockingProvider;
use OCP\Lock\LockedException;
use OCP\Share\IShare;

class ReviewStore {
	public function __construct(private IRootFolder $root, private ILockingProvider $locks, private DraftLocator $draftLocator) {
	}

	public function isReviewable(IShare $share): bool {
		if ($share->getShareType() !== IShare::TYPE_LINK
			|| ($share->getPermissions() & (Constants::PERMISSION_UPDATE | Constants::PERMISSION_CREATE | Constants::PERMISSION_DELETE)) !== 0
			|| $share->getSharedBy() !== $share->getShareOwner()) {
			return false;
		}
		$folder = $share->getNode();
		if (!$folder instanceof Folder) {
			return false;
		}
		try {
			$marker = $folder->get('.gloss-review');
		} catch (NotFoundException) {
			return false;
		}
		if (!$marker instanceof File || $marker->getSize() > 4096) {
			return false;
		}
		$content = $marker->getContent();
		return strlen($content) <= 4096 && ($content === '' || json_decode($content) instanceof \stdClass);
	}

	public function open(IShare $share, ReviewKey $key): ?StoredReview {
		$this->requireReviewable($share);
		$file = $this->find($this->reviews($share, false), $key);
		if ($file === null) {
			return null;
		}
		$content = $file->getContent();
		return new StoredReview($content, $this->decode($content)->revision);
	}

	public function save(IShare $share, ReviewKey $key, string $review, int $baseRevision): SaveResult {
		$this->requireReviewable($share);
		$lock = 'gloss-review/' . $share->getToken() . '/' . substr($key->fileSuffix(), 1, 16);
		try {
			$this->locks->acquireLock($lock, ILockingProvider::LOCK_EXCLUSIVE);
		} catch (LockedException) {
			throw new ReviewRefused(423, 'busy');
		}
		try {
			$incoming = $this->decode($review);
			$folder = $this->reviews($share, false);
			$file = $this->find($folder, $key);
			$bytes = $file?->getContent();
			$stored = $bytes === null ? null : $this->decode($bytes);
			$revision = $stored?->revision ?? 0;
			// A retry of a landed save is successful even when it was Send.
			if ($stored !== null && $revision === $incoming->revision && $bytes === $review) {
				return $this->result($file, $incoming, false, $share->getNode());
			}
			if ($stored?->sent === true) {
				throw new ReviewRefused(409, 'sent');
			}
			if ($baseRevision < 0 || $baseRevision !== $revision || $incoming->revision !== $baseRevision + 1) {
				throw new ReviewRefused(409, 'conflict', $revision);
			}
			if ($file === null) {
				$folder ??= $this->reviews($share, true);
				$count = count(array_filter($folder->getDirectoryListing(), static fn ($node) =>
					$node instanceof File && preg_match('/-([a-f0-9]{16})\.json\z/', $node->getName()) === 1));
				if ($count >= 50) {
					throw new ReviewRefused(409, 'full');
				}
				$file = $folder->newFile($key->fileName($incoming->name), $review);
			} else {
				$file->putContent($review);
			}
			return $this->result($file, $incoming, $incoming->sent, $share->getNode());
		} finally {
			$this->locks->releaseLock($lock, ILockingProvider::LOCK_EXCLUSIVE);
		}
	}

	private function requireReviewable(IShare $share): void {
		if (!$this->isReviewable($share)) {
			throw new ReviewRefused(403, 'notReviewable');
		}
	}

	private function reviews(IShare $share, bool $create): ?Folder {
		$shared = $this->root->getUserFolder($share->getShareOwner())->getFirstNodeById($share->getNodeId());
		if (!$shared instanceof Folder) {
			throw new NotFoundException('The share is not a folder.');
		}
		$parent = $shared->getParent();
		$name = $shared->getName() . ' reviews';
		try {
			$reviews = $parent->get($name);
		} catch (NotFoundException) {
			return $create ? $parent->newFolder($name) : null;
		}
		if (!$reviews instanceof Folder) {
			throw new ReviewRefused(409, 'reviewsBlocked');
		}
		return $reviews;
	}

	private function find(?Folder $folder, ReviewKey $key): ?File {
		foreach ($folder?->getDirectoryListing() ?? [] as $file) {
			if ($file instanceof File && hash_equals($key->fileSuffix(), substr($file->getName(), -strlen($key->fileSuffix())))) {
				return $file;
			}
		}
		return null;
	}

	private function decode(string $bytes): \stdClass {
		if (strlen($bytes) > 1048576) {
			throw new ReviewRefused(413, 'tooLarge');
		}
		$review = json_decode($bytes, false, 16);
		if (!$review instanceof \stdClass || ($review->format ?? null) !== 1
			|| !is_int($review->revision ?? null) || $review->revision < 1
			|| !is_string($review->name ?? null) || mb_strlen($review->name) < 1 || mb_strlen($review->name) > 100
			|| !is_bool($review->sent ?? null) || !is_array($review->items ?? null)) {
			throw new ReviewRefused(400, 'badReview');
		}
		return $review;
	}

	private function result(File $file, \stdClass $review, bool $sentNow, Folder $folder): SaveResult {
		$draftFile = $this->draftLocator->locate($folder)?->main->getName() ?? '';
		return new SaveResult($review->revision, $sentNow, $file->getId(), $file->getPath(), $review->name, $draftFile);
	}
}
