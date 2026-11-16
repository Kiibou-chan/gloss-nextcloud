<?php

declare(strict_types=1);

namespace OCA\Gloss\Tests\Unit\Service;

use OCA\Gloss\Service\SharedPath;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class SharedPathTest extends TestCase {
	public static function paths(): array {
		return [
			'plain file' => ['refs.bib', 'refs.bib'],
			'nested file' => ['data/a.csv', 'data/a.csv'],
			'empty segment' => ['a//b', null],
			'absolute' => ['/abs', null],
			'parent' => ['../x', null],
			'parent inside' => ['a/../b', null],
			'current directory' => ['./a', null],
			'review marker' => ['.gloss-review', null],
			'backslash' => ['a\\b', null],
			'NUL' => ["a\0b", null],
			'empty' => ['', null],
			'sixteen segments' => [implode('/', array_fill(0, 16, 'a')), implode('/', array_fill(0, 16, 'a'))],
			'seventeen segments' => [implode('/', array_fill(0, 17, 'a')), null],
			'512 bytes' => [str_repeat('a', 512), str_repeat('a', 512)],
			'513 bytes' => [str_repeat('a', 513), null],
			'reviews folder' => ['../Review reviews/x.json', null],
			'trailing slash' => ['a/', null],
		];
	}

	#[DataProvider('paths')]
	public function testNormalise(string $path, ?string $expected): void {
		self::assertSame($expected, SharedPath::normalise($path));
	}
}
