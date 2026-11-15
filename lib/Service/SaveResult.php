<?php

declare(strict_types=1);

namespace OCA\Gloss\Service;

final class SaveResult {
	public function __construct(
		public readonly int $revision,
		public readonly bool $sentNow,
		public readonly int $fileId,
		public readonly string $path,
		public readonly string $name,
	) {
	}
}
