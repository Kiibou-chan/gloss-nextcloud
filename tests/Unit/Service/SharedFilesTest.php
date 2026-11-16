<?php

declare(strict_types=1);

namespace OCA\Gloss\Tests\Unit\Service;

use OCA\Gloss\Service\SharedFiles;
use OCP\Constants;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\NotFoundException;
use OCP\Share\IShare;
use PHPUnit\Framework\TestCase;

final class SharedFilesTest extends TestCase {
	private function share(int $permissions = Constants::PERMISSION_READ): IShare {
		$share = $this->createMock(IShare::class);
		$share->method('getPermissions')->willReturn($permissions);
		return $share;
	}

	private function folder(string $sharedPath, ?object $node, bool $throws = false): Folder {
		$folder = $this->createMock(Folder::class);
		$folder->method('getPath')->willReturn($sharedPath);
		if ($throws) {
			$folder->method('get')->willThrowException(new NotFoundException());
		} else {
			$folder->method('get')->willReturn($node);
		}
		return $folder;
	}

	private function file(string $path, int $size = 10): File {
		$file = $this->createMock(File::class);
		$file->method('getPath')->willReturn($path);
		$file->method('getSize')->willReturn($size);
		return $file;
	}

	public function testServesAFileInsideTheSharedFolder(): void {
		$file = $this->file('/u/files/Review/refs.bib');
		self::assertSame($file, (new SharedFiles())->read($this->share(), $this->folder('/u/files/Review', $file), 'refs.bib'));
	}

	public function testRefusesAFolder(): void {
		$node = $this->createMock(Folder::class);
		$node->method('getPath')->willReturn('/u/files/Review/data');
		self::assertNull((new SharedFiles())->read($this->share(), $this->folder('/u/files/Review', $node), 'data'));
	}

	public function testRefusesAMissingNode(): void {
		self::assertNull((new SharedFiles())->read($this->share(), $this->folder('/u/files/Review', null, true), 'gone.bib'));
	}

	public function testRefusesANodeOutsideTheSharedPath(): void {
		$file = $this->file('/other/files/x.bib');
		self::assertNull((new SharedFiles())->read($this->share(), $this->folder('/u/files/Review', $file), 'x.bib'));
	}

	public function testRefusesTheSiblingReviewsFolder(): void {
		$file = $this->file('/u/files/Review reviews/x.json');
		self::assertNull((new SharedFiles())->read($this->share(), $this->folder('/u/files/Review', $file), 'x.json'));
	}

	public function testRefusesAShareWithoutReadPermission(): void {
		$file = $this->file('/u/files/Review/refs.bib');
		$folder = $this->folder('/u/files/Review', $file);
		self::assertNull((new SharedFiles())->read($this->share(Constants::PERMISSION_CREATE), $folder, 'refs.bib'));
		self::assertSame($file, (new SharedFiles())->read($this->share(Constants::PERMISSION_READ | Constants::PERMISSION_UPDATE), $folder, 'refs.bib'));
	}

	public function testRefusesOverTwentyMebibytesAndServesExactly(): void {
		$limit = 20 * 1024 * 1024;
		$big = $this->file('/u/files/Review/big.bin', $limit + 1);
		self::assertNull((new SharedFiles())->read($this->share(), $this->folder('/u/files/Review', $big), 'big.bin'));
		$edge = $this->file('/u/files/Review/edge.bin', $limit);
		self::assertSame($edge, (new SharedFiles())->read($this->share(), $this->folder('/u/files/Review', $edge), 'edge.bin'));
	}

	public function testRefusesAnUnnormalisedPathWithoutLookup(): void {
		$folder = $this->createMock(Folder::class);
		$folder->expects(self::never())->method('get');
		self::assertNull((new SharedFiles())->read($this->share(), $folder, '../Review reviews/x.json'));
	}
}
