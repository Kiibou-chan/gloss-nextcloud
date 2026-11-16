<?php

declare(strict_types=1);

namespace OCA\Gloss\Service;

/** A path a draft names, checked to stay inside the shared folder. */
final class SharedPath {
	private const MAX_BYTES = 512;
	private const MAX_SEGMENTS = 16;

	/** The path unchanged when it is a plain relative path, otherwise null. */
	public static function normalise(string $path): ?string {
		if ($path === '' || strlen($path) > self::MAX_BYTES || str_contains($path, "\0") || str_contains($path, '\\')) {
			return null;
		}
		$segments = explode('/', $path);
		if (count($segments) > self::MAX_SEGMENTS) {
			return null;
		}
		foreach ($segments as $segment) {
			if ($segment === '' || $segment[0] === '.') {
				return null;
			}
		}
		return $path;
	}
}
