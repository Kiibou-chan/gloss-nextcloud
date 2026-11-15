<?php

declare(strict_types=1);

namespace OCA\Gloss\Controller;

use OCA\Gloss\Exception\ReviewRefused;
use OCA\Gloss\Service\DraftLocator;
use OCA\Gloss\Service\ReviewStore;
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
 * proposals are kept in the folder under reviews/, one JSON file per reviewer.
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
		Util::addScript('gloss', 'gloss-review');
		Util::addStyle('gloss', 'review');
		Util::addStyle('gloss', 'pdf-text-layer');
		$draft = $this->draftLocator->locate($this->folder())?->main;
		$response = new PublicTemplateResponse('gloss', 'review', [
			'token' => $this->getToken(),
			'draftName' => $draft?->getName() ?? '',
			'hasPdf' => $this->draftLocator->pdf($this->folder()) !== null,
			'worker' => $this->urls->linkTo('gloss', 'js/pdf.worker.js'),
			'reviewable' => true,
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
		$draft = $this->draftLocator->locate($this->folder())?->main;
		if ($draft === null) {
			return new DataResponse(['error' => 'The shared folder holds no draft.'], Http::STATUS_NOT_FOUND);
		}
		return new DataResponse(['name' => $draft->getName(), 'text' => $draft->getContent(), 'etag' => $draft->getEtag()]);
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
	public function load(string $reviewer): DataResponse {
		try {
			$share = $this->getShare();
			if ($share === null) {
				throw new NotFoundException('The share is not a folder.');
			}
			return new DataResponse($this->reviewStore->load($share, $reviewer));
		} catch (ReviewRefused $e) {
			return new DataResponse(['error' => $e->getMessage()], $e->status);
		}
	}

	#[PublicPage]
	public function save(string $reviewer, string $review): DataResponse {
		$share = $this->getShare();
		if ($share === null) {
			return new DataResponse(['error' => 'This link does not allow saving.'], Http::STATUS_FORBIDDEN);
		}
		try {
			$this->reviewStore->save($share, $reviewer, $review);
			return new DataResponse(['saved' => true]);
		} catch (ReviewRefused $e) {
			return new DataResponse(['error' => $e->getMessage()], $e->status);
		}
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
