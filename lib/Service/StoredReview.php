<?php

declare(strict_types=1);

namespace OCA\Gloss\Service;

final class StoredReview {
	public function __construct(public readonly string $content, public readonly int $revision) {
	}
}
