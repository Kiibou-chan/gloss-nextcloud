<?php

declare(strict_types=1);

namespace OCA\Gloss\Tests\Unit\Service;

use OCA\Gloss\Service\DraftLocator;
use OCP\Files\File;
use OCP\Files\Folder;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class DraftLocatorTest extends TestCase {
	public static function choices(): array {
		return [
			'first by name, case-insensitive extensions' => [['z.typ', 'a.TEX', 'b.md', 'c.txt'], [], 'a.TEX', null],
			'folder and unsupported extension ignored' => [['notes.csv', 'b.MD'], ['a.typ'], 'b.MD', null],
			'matching PDF preferred' => [['paper.typ', 'other.pdf', 'paper.PDF'], [], 'paper.typ', 'paper.PDF'],
			'only PDF fallback' => [['paper.txt', 'other.pdf'], [], 'paper.txt', 'other.pdf'],
			'ambiguous PDFs' => [['paper.tex', 'a.pdf', 'b.pdf'], [], 'paper.tex', null],
			'no draft' => [['a.pdf'], ['draft.typ'], null, null],
		];
	}

	public function testPdfWithoutSource(): void {
		$file = $this->createMock(File::class);
		$file->method('getName')->willReturn('only.PDF');
		$folder = $this->createMock(Folder::class);
		$folder->method('getDirectoryListing')->willReturn([$file]);
		self::assertSame($file, (new DraftLocator())->pdf($folder));
	}

	#[DataProvider('choices')]
	public function testChoices(array $names, array $folders, ?string $main, ?string $pdf): void {
		$nodes = [];
		foreach ($names as $name) {
			$file = $this->createMock(File::class);
			$file->method('getName')->willReturn($name);
			$nodes[] = $file;
		}
		foreach ($folders as $name) {
			$folder = $this->createMock(Folder::class);
			$folder->method('getName')->willReturn($name);
			$nodes[] = $folder;
		}
		$shared = $this->createMock(Folder::class);
		$shared->method('getDirectoryListing')->willReturn($nodes);
		$draft = (new DraftLocator())->locate($shared);
		self::assertSame($main, $draft?->main->getName());
		self::assertSame($pdf, $draft?->pdf?->getName());
		if ($main !== null) {
			self::assertSame([$draft->main], $draft->files);
		} else {
			self::assertNull($draft);
		}
	}
}
