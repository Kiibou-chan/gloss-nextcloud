<?php

declare(strict_types=1);

namespace OCA\Gloss\Controller;

use OCA\Gloss\Exception\ReviewRefused;
use OCA\Gloss\Service\DraftLocator;
use OCA\Gloss\Service\ReviewStore;
use OCA\Gloss\Service\ReviewKey;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\AppFramework\Http\ContentSecurityPolicy;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\Response;
use OCP\AppFramework\Http\StreamResponse;
use OCP\AppFramework\Http\Template\PublicTemplateResponse;
use OCP\AppFramework\PublicShareController;
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
 * proposals are kept beside the folder, one JSON file per reviewer.
 */
class ReviewController extends PublicShareController {
	private ?IShare $share = null;

	public function __construct(
		string $appName,
		IRequest $request,
		ISession $session,
		private IManager $shareManager,
		private IURLGenerator $urls,
		private DraftLocator $draftLocator,
		private ReviewStore $reviewStore,
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
		Util::addScript('gloss', 'diff');
		Util::addScript('gloss', 'vendor/editor.bundle');
		Util::addScript('gloss', 'review');
		Util::addStyle('gloss', 'review');
		$draft = $this->draftLocator->locate($this->folder())?->main;
		$response = new PublicTemplateResponse('gloss', 'review', [
			'token' => $this->getToken(),
			'draftName' => $draft?->getName() ?? '',
			'hasPdf' => $this->draftLocator->pdf($this->folder()) !== null,
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
	public function pdf(): Response {
		$pdf = $this->draftLocator->pdf($this->folder());
		if ($pdf === null) {
			return new DataResponse(['error' => 'The shared folder holds no PDF.'], Http::STATUS_NOT_FOUND);
		}
		$response = new StreamResponse($pdf->fopen('rb'));
		$response->addHeader('Content-Type', 'application/pdf');
		return $response;
	}

	#[PublicPage]
	#[NoCSRFRequired]
	public function draft(): DataResponse {
		$draft = $this->draftLocator->locate($this->folder());
		if ($draft === null) {
			return new DataResponse(['error' => 'The shared folder holds no draft.'], Http::STATUS_NOT_FOUND);
		}
		return new DataResponse([
			'main' => $draft->main->getName(),
			'files' => array_map(static fn ($file) => [
				'file' => $file->getName(),
				'text' => $file->getContent(),
				'etag' => $file->getEtag(),
			], $draft->files),
		]);
	}

	#[PublicPage]
	#[NoCSRFRequired]
	public function open(string $key): DataResponse {
		$parsed = ReviewKey::parse($key);
		if ($parsed === null) {
			return new DataResponse(['error' => 'badKey'], Http::STATUS_BAD_REQUEST);
		}
		try {
			$stored = $this->reviewStore->open($this->requireShare(), $parsed);
			return new DataResponse($stored === null ? ['review' => null] : [
				'review' => json_decode($stored->content, true), 'revision' => $stored->revision,
			]);
		} catch (ReviewRefused $e) {
			return $this->refusal($e);
		}
	}

	#[PublicPage]
	public function save(string $key, string $review, int $baseRevision): DataResponse {
		$parsed = ReviewKey::parse($key);
		if ($parsed === null) {
			return new DataResponse(['error' => 'badKey'], Http::STATUS_BAD_REQUEST);
		}
		try {
			$result = $this->reviewStore->save($this->requireShare(), $parsed, $review, $baseRevision);
			return new DataResponse(['revision' => $result->revision]);
		} catch (ReviewRefused $e) {
			return $this->refusal($e);
		}
	}

	private function refusal(ReviewRefused $e): DataResponse {
		$body = ['error' => $e->getMessage()];
		if ($e->revision !== null) {
			$body['revision'] = $e->revision;
		}
		return new DataResponse($body, $e->status);
	}

	private function requireShare(): IShare {
		return $this->getShare() ?? throw new NotFoundException('The share is not a folder.');
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
}
