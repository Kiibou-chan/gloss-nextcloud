<?php

declare(strict_types=1);

namespace OCA\Gloss\Exception;

use RuntimeException;

class ReviewRefused extends RuntimeException {
	public function __construct(public readonly int $status, string $message, public readonly ?int $revision = null) {
		parent::__construct($message, $status);
	}
}
