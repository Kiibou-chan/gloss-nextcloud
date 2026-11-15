<?php

declare(strict_types=1);

namespace OCA\Gloss\Controller;

use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\AppFramework\Http\ContentSecurityPolicy;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\Response;
use OCP\AppFramework\Http\StreamResponse;
use OCP\AppFramework\Http\Template\PublicTemplateResponse;
use OCP\AppFramework\PublicShareController;
use OCP\Constants;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\NotFoundException;
use OCP\IRequest;
use OCP\IURLGenerator;
use OCP\ISession;
use OCP\Share\Exceptions\ShareNotFound;
use OCP\Share\IManager;
use OCP\Share\IShare;
use OCP\Util;

/**
 * A review page for a public link to a folder: the folder's draft is shown as text, and each reviewer's comments and
 * proposals are kept in the folder under reviews/, one JSON file per reviewer.
 */
class ReviewController extends PublicShareController {
	private const DRAFT_EXTENSIONS = ['typ', 'tex', 'md', 'txt'];
	private const MAX_REVIEW_BYTES = 1048576;

	private ?IShare $share = null;

	public function __construct(
		string $appName,
		IRequest $request,
		ISession $session,
		private IManager $shareManager,
		private IURLGenerator $urls,
	) {
		parent::__construct($appName, $request, $session);
	}

	protected function getPasswordHash(): ?string {
		return $this->getShare()?->getPassword();
	}

	public function isValidToken(): bool {
		$share = $this->getShare();
		return $share !== null && $share->getNode() instanceof Folder;
	}

	protected function isPasswordProtected(): bool {
		return $this->getShare()?->getPassword() !== null;
	}

	#[PublicPage]
	#[NoCSRFRequired]
	public function page(): PublicTemplateResponse {
		Util::addScript('gloss', 'vendor/pdf.min');
		Util::addScript('gloss', 'typst-view');
		Util::addScript('gloss', 'pdf-view');
		Util::addScript('gloss', 'review');
		Util::addStyle('gloss', 'review');
		$draft = $this->draft();
		$response = new PublicTemplateResponse('gloss', 'review', [
			'token' => $this->getToken(),
			'draftName' => $draft?->getName() ?? '',
			'hasPdf' => $this->pdfFile() !== null,
			'worker' => $this->urls->linkTo('gloss', 'js/vendor/pdf.worker.min.js'),
		]);
		$csp = new ContentSecurityPolicy();
		$csp->addAllowedWorkerSrcDomain("'self'");
		$csp->addAllowedFontDomain('data:');
		$response->setContentSecurityPolicy($csp);
		$response->setHeaderTitle('Review: ' . ($draft?->getName() ?? 'no draft'));
		return $response;
	}

	#[PublicPage]
	#[NoCSRFRequired]
	public function text(): DataResponse {
		$draft = $this->draft();
		if ($draft === null) {
			return new DataResponse(['error' => 'The shared folder holds no draft.'], Http::STATUS_NOT_FOUND);
		}
		return new DataResponse(['name' => $draft->getName(), 'text' => $draft->getContent(), 'etag' => $draft->getEtag()]);
	}

	#[PublicPage]
	#[NoCSRFRequired]
	public function pdf(): Response {
		$pdf = $this->pdfFile();
		if ($pdf === null) {
			return new DataResponse(['error' => 'The shared folder holds no PDF.'], Http::STATUS_NOT_FOUND);
		}
		$response = new StreamResponse($pdf->fopen('rb'));
		$response->addHeader('Content-Type', 'application/pdf');
		return $response;
	}

	#[PublicPage]
	#[NoCSRFRequired]
	public function load(string $reviewer): DataResponse {
		$name = $this->fileName($reviewer);
		if ($name === null) {
			return new DataResponse(['error' => 'Bad reviewer key.'], Http::STATUS_BAD_REQUEST);
		}
		try {
			$file = $this->folder()->get('reviews/' . $name);
		} catch (NotFoundException) {
			return new DataResponse(['items' => [], 'sent' => false]);
		}
		if (!$file instanceof File) {
			return new DataResponse(['error' => 'Not a file.'], Http::STATUS_CONFLICT);
		}
		return new DataResponse(json_decode($file->getContent(), true) ?? ['items' => [], 'sent' => false]);
	}

	#[PublicPage]
	public function save(string $reviewer, string $review): DataResponse {
		$share = $this->getShare();
		if ($share === null || ($share->getPermissions() & Constants::PERMISSION_CREATE) === 0) {
			return new DataResponse(['error' => 'This link does not allow saving.'], Http::STATUS_FORBIDDEN);
		}
		$name = $this->fileName($reviewer);
		if ($name === null || strlen($review) > self::MAX_REVIEW_BYTES || !is_array(json_decode($review, true))) {
			return new DataResponse(['error' => 'Bad review.'], Http::STATUS_BAD_REQUEST);
		}
		$folder = $this->folder();
		$reviews = $folder->nodeExists('reviews') ? $folder->get('reviews') : $folder->newFolder('reviews');
		if (!$reviews instanceof Folder) {
			return new DataResponse(['error' => 'reviews is not a folder.'], Http::STATUS_CONFLICT);
		}
		if ($reviews->nodeExists($name)) {
			$file = $reviews->get($name);
			if (!$file instanceof File) {
				return new DataResponse(['error' => 'Not a file.'], Http::STATUS_CONFLICT);
			}
			$file->putContent($review);
		} else {
			$reviews->newFile($name, $review);
		}
		return new DataResponse(['saved' => true]);
	}

	private function getShare(): ?IShare {
		if ($this->share === null) {
			try {
				$this->share = $this->shareManager->getShareByToken($this->getToken());
			} catch (ShareNotFound) {
				return null;
			}
		}
		return $this->share;
	}

	private function folder(): Folder {
		$node = $this->getShare()?->getNode();
		if (!$node instanceof Folder) {
			throw new NotFoundException('The share is not a folder.');
		}
		return $node;
	}

	/** The draft: the first file at the folder's top level with a draft extension, by name. */
	private function draft(): ?File {
		$files = array_filter($this->folder()->getDirectoryListing(), fn ($n) => $n instanceof File
			&& in_array(strtolower(pathinfo($n->getName(), PATHINFO_EXTENSION)), self::DRAFT_EXTENSIONS, true));
		usort($files, fn ($a, $b) => strcmp($a->getName(), $b->getName()));
		return $files[0] ?? null;
	}

	/** The PDF of the draft: the PDF with the draft's base name, or else the only PDF at the folder's top level. */
	private function pdfFile(): ?File {
		$pdfs = array_values(array_filter($this->folder()->getDirectoryListing(), fn ($n) => $n instanceof File
			&& strtolower(pathinfo($n->getName(), PATHINFO_EXTENSION)) === 'pdf'));
		$base = pathinfo($this->draft()?->getName() ?? '', PATHINFO_FILENAME);
		foreach ($pdfs as $pdf) {
			if (pathinfo($pdf->getName(), PATHINFO_FILENAME) === $base) {
				return $pdf;
			}
		}
		return count($pdfs) === 1 ? $pdfs[0] : null;
	}

	/** The review file's name for a reviewer key, which the page makes as name-slug plus a random part. */
	private function fileName(string $reviewer): ?string {
		return preg_match('/^[a-z0-9-]{1,80}$/', $reviewer) === 1 ? $reviewer . '.json' : null;
	}
}
