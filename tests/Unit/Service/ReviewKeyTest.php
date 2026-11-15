<?php

declare(strict_types=1);

namespace OCA\Gloss\Tests\Unit\Service;

use OCA\Gloss\Service\ReviewKey;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class ReviewKeyTest extends TestCase {
	public static function invalidKeys(): array {
		return array_map(static fn ($key) => [$key], ['', str_repeat('a', 15), str_repeat('a', 17), 'abcdefghijklmno/', 'abcdefghijklmno.', 'abcdefghijklmnoé', "abcdefghijklmnop\n"]);
	}

	#[DataProvider('invalidKeys')]
	public function testRejectsMalformedKeys(string $key): void {
		self::assertNull(ReviewKey::parse($key));
	}

	public function testSuffixHashesTheEntireCaseSensitiveKey(): void {
		$key = ReviewKey::parse('AbCdEf0123456789');
		self::assertNotNull($key);
		self::assertSame('-' . substr(hash('sha256', 'AbCdEf0123456789'), 0, 16) . '.json', $key->fileSuffix());
		self::assertNotSame($key->fileSuffix(), ReviewKey::parse('abcdef0123456789')->fileSuffix());
	}
	public function testFileNameSlug(): void {
		$key = ReviewKey::parse('AbCdEf0123456789');
		foreach (['Ada Lovelace' => 'ada', '' => 'reviewer', '!!!' => 'reviewer', '  Grace Hopper' => 'grace', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' => 'abcdefghijklmnopqrstuvwx'] as $name => $slug) {
			self::assertSame($slug . $key->fileSuffix(), $key->fileName($name));
		}
	}

}
