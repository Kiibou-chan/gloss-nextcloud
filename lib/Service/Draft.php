<?php

declare(strict_types=1);

namespace OCA\Gloss\Service;

use OCP\Files\File;

final class Draft {
	/** @param list<File> $files */
	public function __construct(
		public readonly File $main,
		public readonly array $files,
		public readonly ?File $pdf,
	) {
	}
}
