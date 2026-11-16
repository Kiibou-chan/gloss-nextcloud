<?php

declare(strict_types=1);

namespace OCA\Gloss\Service;

use OCP\Constants;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\NotFoundException;
use OCP\Share\IShare;

/** Files of the shared folder that a draft may read, within the share's rights. */
class SharedFiles {
	private const MAX_SIZE = 20 * 1024 * 1024;

	public function read(IShare $share, Folder $folder, string $path): ?File {
		$relative = SharedPath::normalise($path);
		if ($relative === null || ($share->getPermissions() & Constants::PERMISSION_READ) === 0) {
			return null;
		}
		try {
			$node = $folder->get($relative);
		} catch (NotFoundException) {
			return null;
		}
		if (!$node instanceof File || !str_starts_with($node->getPath(), $folder->getPath() . '/')) {
			return null;
		}
		return $node->getSize() <= self::MAX_SIZE ? $node : null;
	}
}
