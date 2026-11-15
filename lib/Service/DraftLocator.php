<?php

declare(strict_types=1);

namespace OCA\Gloss\Service;

use OCP\Files\File;
use OCP\Files\Folder;

class DraftLocator {
	private const DRAFT_EXTENSIONS = ['typ', 'tex', 'md', 'txt'];

	public function locate(Folder $folder): ?Draft {
		$files = $this->files($folder);
		$main = $this->main($files);
		return $main === null ? null : new Draft($main, [$main], $this->selectPdf($files, $main));
	}

	/** Preserve the PDF endpoint's fallback even in a folder without a source draft. */
	public function pdf(Folder $folder): ?File {
		$files = $this->files($folder);
		return $this->selectPdf($files, $this->main($files));
	}

	/** @return list<File> */
	private function files(Folder $folder): array {
		return array_values(array_filter($folder->getDirectoryListing(), static fn ($node) => $node instanceof File));
	}

	/** @param list<File> $files */
	private function main(array $files): ?File {
		$drafts = array_values(array_filter($files, static fn (File $file) =>
			in_array(strtolower(pathinfo($file->getName(), PATHINFO_EXTENSION)), self::DRAFT_EXTENSIONS, true)));
		usort($drafts, static fn (File $a, File $b) => strcmp($a->getName(), $b->getName()));
		return $drafts[0] ?? null;
	}

	/** @param list<File> $files */
	private function selectPdf(array $files, ?File $main): ?File {
		$pdfs = array_values(array_filter($files, static fn (File $file) =>
			strtolower(pathinfo($file->getName(), PATHINFO_EXTENSION)) === 'pdf'));
		$base = pathinfo($main?->getName() ?? '', PATHINFO_FILENAME);
		foreach ($pdfs as $pdf) {
			if (pathinfo($pdf->getName(), PATHINFO_FILENAME) === $base) {
				return $pdf;
			}
		}
		return count($pdfs) === 1 ? $pdfs[0] : null;
	}
}
