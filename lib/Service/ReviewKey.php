<?php

declare(strict_types=1);

namespace OCA\Gloss\Service;

final class ReviewKey {
	private function __construct(private readonly string $hash) {
	}

	public static function parse(string $key): ?self {
		return preg_match('/\A[A-Za-z0-9]{16}\z/', $key) === 1
			? new self(substr(hash('sha256', $key), 0, 16)) : null;
	}

	public function fileSuffix(): string {
		return '-' . $this->hash . '.json';
	}

	public function fileName(string $name): string {
		$word = preg_split('/\s+/u', trim($name))[0] ?? '';
		$slug = substr(preg_replace('/[^a-z0-9-]/', '', strtolower($word)), 0, 24);
		return ($slug === '' ? 'reviewer' : $slug) . $this->fileSuffix();
	}
}
