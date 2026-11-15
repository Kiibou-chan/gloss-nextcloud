<?php

declare(strict_types=1);

namespace OCA\Gloss\Tests\Unit\Service;

use OCA\Gloss\Exception\ReviewRefused;
use OCA\Gloss\Service\ReviewStore;
use OCP\Constants;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\NotFoundException;
use OCP\Share\IShare;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class ReviewStoreTest extends TestCase {
	private function share(Folder $folder, int $permissions = Constants::PERMISSION_CREATE): IShare {
		$share = $this->createMock(IShare::class);
		$share->method('getNode')->willReturn($folder);
		$share->method('getPermissions')->willReturn($permissions);
		return $share;
	}

	public static function invalidSaves(): array {
		return [
			'no create permission' => [1, 'ada-123', '{}', 403, 'This link does not allow saving.'],
			'bad key' => [4, '../ada', '{}', 400, 'Bad review.'],
			'empty key' => [4, '', '{}', 400, 'Bad review.'],
			'long key' => [4, str_repeat('a', 81), '{}', 400, 'Bad review.'],
			'upper-case key' => [4, 'Ada', '{}', 400, 'Bad review.'],
			'oversize' => [4, 'ada', str_repeat(' ', 1048577), 400, 'Bad review.'],
			'invalid JSON' => [4, 'ada', '{', 400, 'Bad review.'],
			'scalar JSON' => [4, 'ada', 'true', 400, 'Bad review.'],
		];
	}

	#[DataProvider('invalidSaves')]
	public function testRefusesInvalidSave(int $permissions, string $key, string $body, int $status, string $message): void {
		$folder = $this->createMock(Folder::class);
		$folder->expects(self::never())->method('newFolder');
		try {
			(new ReviewStore())->save($this->share($folder, $permissions), $key, $body);
			self::fail('Expected a refusal.');
		} catch (ReviewRefused $e) {
			self::assertSame($status, $e->status);
			self::assertSame($message, $e->getMessage());
		}
	}

	public function testMissingLoadReturnsEmptyReview(): void {
		$folder = $this->createMock(Folder::class);
		$folder->method('get')->with('reviews/ada-123.json')->willThrowException(new NotFoundException());
		self::assertSame(['items' => [], 'sent' => false], (new ReviewStore())->load($this->share($folder, 1), 'ada-123'));
	}

	public static function savedBodies(): array {
		return [['{"sent":true,"items":[]} ', ['sent' => true, 'items' => []]], ['{', ['items' => [], 'sent' => false]]];
	}

	#[DataProvider('savedBodies')]
	public function testLoadsSavedBytes(string $body, array $expected): void {
		$file = $this->createMock(File::class);
		$file->method('getContent')->willReturn($body);
		$folder = $this->createMock(Folder::class);
		$folder->method('get')->with('reviews/ada.json')->willReturn($file);
		self::assertSame($expected, (new ReviewStore())->load($this->share($folder), 'ada'));
	}

	public function testInvalidLoadKey(): void {
		$this->expectException(ReviewRefused::class);
		$this->expectExceptionMessage('Bad reviewer key.');
		(new ReviewStore())->load($this->share($this->createMock(Folder::class)), '../ada');
	}

	public function testLoadRefusesDirectory(): void {
		$folder = $this->createMock(Folder::class);
		$folder->method('get')->willReturn($this->createMock(Folder::class));
		$this->expectException(ReviewRefused::class);
		$this->expectExceptionMessage('Not a file.');
		(new ReviewStore())->load($this->share($folder), 'ada');
	}

	public static function saveCases(): array {
		return [['new directory', false, false], ['new file', true, false], ['overwrite', true, true]];
	}

	#[DataProvider('saveCases')]
	public function testSavesExactBytes(string $case, bool $directoryExists, bool $fileExists): void {
		$body = '{"sent":true,"items":[]} ';
		$folder = $this->createMock(Folder::class);
		$reviews = $this->createMock(Folder::class);
		$folder->method('nodeExists')->with('reviews')->willReturn($directoryExists);
		$folder->expects($directoryExists ? self::once() : self::never())->method('get')->with('reviews')->willReturn($reviews);
		$folder->expects($directoryExists ? self::never() : self::once())->method('newFolder')->with('reviews')->willReturn($reviews);
		$reviews->method('nodeExists')->with('ada.json')->willReturn($fileExists);
		if ($fileExists) {
			$file = $this->createMock(File::class);
			$reviews->method('get')->with('ada.json')->willReturn($file);
			$file->expects(self::once())->method('putContent')->with($body);
		}
		$reviews->expects($fileExists ? self::never() : self::once())->method('newFile')->with('ada.json', $body);
		(new ReviewStore())->save($this->share($folder), 'ada', $body);
	}

	public static function blockedNodes(): array {
		return [['reviews', 'reviews is not a folder.'], ['review', 'Not a file.']];
	}

	#[DataProvider('blockedNodes')]
	public function testSaveRefusesWrongNodeType(string $blocked, string $message): void {
		$folder = $this->createMock(Folder::class);
		$folder->method('nodeExists')->willReturn(true);
		$reviews = $this->createMock(Folder::class);
		$reviews->method('nodeExists')->willReturn(true);
		$reviews->method('get')->willReturn($this->createMock(Folder::class));
		$folder->method('get')->willReturn($blocked === 'reviews' ? $this->createMock(File::class) : $reviews);
		$this->expectException(ReviewRefused::class);
		$this->expectExceptionMessage($message);
		(new ReviewStore())->save($this->share($folder), 'ada', '{}');
	}

	public function testAcceptsOneMiBAndLongestKey(): void {
		$body = '{}' . str_repeat(' ', 1048574);
		$reviews = $this->createMock(Folder::class);
		$reviews->expects(self::once())->method('newFile')->with(str_repeat('a', 80) . '.json', $body);
		$folder = $this->createMock(Folder::class);
		$folder->method('newFolder')->willReturn($reviews);
		(new ReviewStore())->save($this->share($folder), str_repeat('a', 80), $body);
	}
}
