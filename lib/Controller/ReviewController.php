<?php

declare(strict_types=1);

namespace OCA\Gloss\Controller;

use OCA\Gloss\Exception\ReviewRefused;
use OCA\Gloss\Service\DraftLocator;
use OCA\Gloss\Service\ReviewStore;
use OCA\Gloss\Service\SentNotifier;
use OCA\Gloss\Service\ReviewKey;
use OCA\Gloss\Service\SharedFiles;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\AppFramework\Http\ContentSecurityPolicy;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\Response;
use OCP\AppFramework\Http\StreamResponse;
use OCP\AppFramework\Http\Template\PublicTemplateResponse;
use OCP\AppFramework\AuthPublicShareController;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\Constants;
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
class ReviewController extends AuthPublicShareController {
	private ?IShare $share = null;

	public function __construct(
		string $appName,
		IRequest $request,
		ISession $session,
		private IManager $shareManager,
		private IURLGenerator $urls,
		private DraftLocator $draftLocator,
		private ReviewStore $reviewStore,
		private SentNotifier $sentNotifier,
		private SharedFiles $sharedFiles,
	) {
		parent::__construct($appName, $request, $session, $urls);
	}

	public function isAuthenticated(): bool {
		$authenticated = parent::isAuthenticated();
		$action = substr(strrchr((string)$this->request->getParam('_route'), '.') ?: '', 1);
		if (!$authenticated && in_array($action, ['draft', 'pdf', 'file', 'open', 'save'], true)) {
			throw new NotFoundException();
		}
		return $authenticated;
	}

	protected function verifyPassword(string $password): bool {
		return $this->shareManager->checkPassword($this->requireShare(), $password);
	}

	#[PublicPage]
	#[NoCSRFRequired]
	public function showAuthenticate(): TemplateResponse {
		return $this->authenticationForm(false);
	}

	protected function showAuthFailed(): TemplateResponse {
		return $this->authenticationForm(true);
	}

	private function authenticationForm(bool $wrongPassword): TemplateResponse {
		return new TemplateResponse('gloss', 'authenticate', [
			'action' => $this->urls->linkToRoute('gloss.review.authenticate', ['token' => $this->getToken()]),
			'wrongpw' => $wrongPassword,
			'fragmentScope' => hash('sha256', $this->getToken()),
		], 'guest');
	}

	#[PublicPage]
	#[NoCSRFRequired]
	public function showShare(): TemplateResponse {
		return $this->page();
	}

	protected function getPasswordHash(): ?string {
		return $this->getShare()?->getPassword();
	}

	public function isValidToken(): bool {
		$share = $this->getShare();
		return $share !== null
			&& in_array($share->getShareType(), [IShare::TYPE_LINK, IShare::TYPE_EMAIL], true)
			&& ($share->getPermissions() & Constants::PERMISSION_READ) !== 0
			&& !$share->getHideDownload()
			&& $share->getAttributes()?->getAttribute('permissions', 'download') !== false
			&& $share->getNode() instanceof Folder
			&& $share->getNode()->isReadable()
			&& $share->getNode()->isShareable();
	}

	protected function isPasswordProtected(): bool {
		return $this->getShare()?->getPassword() !== null;
	}

	#[PublicPage]
	#[NoCSRFRequired]
	public function page(): PublicTemplateResponse {
		$folder = $this->folder();
		Util::addScript('gloss', 'gloss-review');
		Util::addStyle('gloss', 'review');
		Util::addStyle('gloss', 'pdf-text-layer');
		$draft = $this->draftLocator->locate($folder)?->main;
		$response = new PublicTemplateResponse('gloss', 'review', [
			'token' => $this->getToken(),
			'passwordProtected' => $this->isPasswordProtected(),
			'base' => $this->urls->linkToRoute('gloss.review.page', ['token' => $this->getToken()]),
			'csrfTokenUrl' => $this->urls->linkToRoute('core.CSRFToken.index'),
			'fragmentScope' => hash('sha256', $this->getToken()),
			'draftName' => $draft?->getName() ?? '',
			'hasPdf' => $this->draftLocator->pdf($folder) !== null,
			'worker' => $this->urls->linkTo('gloss', 'js/pdf.worker.js'),
			'reviewable' => $this->reviewStore->isReviewable($this->requireShare()),
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
	public function file(string $path = ''): Response {
		$file = $this->sharedFiles->read($this->requireShare(), $this->folder(), $path);
		if ($file === null) {
			return new DataResponse(['error' => 'The draft reads a file this link cannot serve.'], Http::STATUS_NOT_FOUND);
		}
		$response = new StreamResponse($file->fopen('rb'));
		$response->addHeader('Content-Type', 'application/octet-stream');
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
				'review' => json_decode($stored->content, true), 'revision' => $stored->revision, 'rawReview' => $stored->content,
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
			$share = $this->requireShare();
			$result = $this->reviewStore->save($share, $parsed, $review, $baseRevision);
			if ($result->sentNow) {
				$this->sentNotifier->notify($share, $result);
			}
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
		if (!$this->isValidToken()) {
			throw new NotFoundException('The share cannot be read.');
		}
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
		if (!$this->isValidToken()) {
			throw new NotFoundException('The share cannot be read.');
		}
		$node = $this->getShare()?->getNode();
		if (!$node instanceof Folder) {
			throw new NotFoundException('The share is not a folder.');
		}
		return $node;
	}
}
