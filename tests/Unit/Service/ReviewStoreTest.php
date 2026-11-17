<?php

declare(strict_types=1);

namespace OCA\Gloss\Tests\Unit\Service;

use OCA\Gloss\Exception\ReviewRefused;
use OCA\Gloss\Service\DraftLocator;
use OCA\Gloss\Service\ReviewKey;
use OCA\Gloss\Service\ReviewStore;
use OCP\Constants;
use OCA\Gloss\Service\SentNotifier;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\Lock\ILockingProvider;
use OCP\Lock\LockedException;
use OCP\Share\IShare;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use RuntimeException;

final class ReviewStoreTest extends TestCase {
	private const KEY = 'AbCdEf0123456789';
	private array $files = [];
	private int $writes = 0;
	private bool $made = false;
	private bool $throwWrite = false;
	private IShare $share;
	private Folder $parent;
	private Folder $reviews;
	private ILockingProvider $locks;

	private function body(int $revision = 1, bool $sent = false, string $name = 'Ada Lovelace'): string {
		return json_encode(['format' => 1, 'revision' => $revision, 'name' => $name, 'sent' => $sent, 'items' => []]);
	}

	private function file(string $name, string $body): File {
		$file = $this->createMock(File::class);
		$file->method('getName')->willReturn($name);
		$file->method('getId')->willReturn(42);
		$file->method('getPath')->willReturn('/owner/files/Review reviews/' . $name);
		$file->method('getContent')->willReturnCallback(fn () => $this->files[$name] ?? $body);
		$file->method('putContent')->willReturnCallback(function ($content) use ($name): void {
			if ($this->throwWrite) { throw new RuntimeException('Synthetic write failure.'); }
			$this->files[$name] = $content;
			$this->writes++;
		});
		return $file;
	}

	private function store(?string $marker = '{}', bool $exists = true, bool $blocked = false): ReviewStore {
		$folder = $this->createMock(Folder::class);
		$folder->method('getName')->willReturn('Review');
		$draft = $this->createMock(File::class);
		$draft->method('getName')->willReturn('paper.typ');
		$folder->method('getDirectoryListing')->willReturn([$draft]);
		$markerFile = $this->createMock(File::class);
		$markerFile->method('getSize')->willReturn(strlen($marker ?? ''));
		$markerFile->method('getContent')->willReturn($marker ?? '');
		$folder->method('get')->with('.gloss-review')->willReturnCallback(function () use ($marker, $markerFile) {
			if ($marker === null) { throw new NotFoundException(); }
			return $markerFile;
		});
		$this->parent = $this->createMock(Folder::class);
		$folder->method('getParent')->willReturn($this->parent);
		$this->reviews = $this->createMock(Folder::class);
		$this->reviews->method('getDirectoryListing')->willReturnCallback(fn () => array_map(fn ($name) => $this->file($name, $this->files[$name]), array_keys($this->files)));
		$this->reviews->method('newFile')->willReturnCallback(function ($name, $content) {
			if ($this->throwWrite) { throw new RuntimeException('Synthetic write failure.'); }
			$this->files[$name] = $content;
			$this->writes++;
			return $this->file($name, $content);
		});
		$this->parent->method('get')->with('Review reviews')->willReturnCallback(function () use ($exists, $blocked) {
			if (!$exists && !$this->made) { throw new NotFoundException(); }
			return $blocked ? $this->createMock(File::class) : $this->reviews;
		});
		$this->parent->method('newFolder')->with('Review reviews')->willReturnCallback(function () {
			$this->made = true;
			return $this->reviews;
		});
		$this->share = $this->createMock(IShare::class);
		$this->share->method('getNode')->willReturn($folder);
		$this->share->method('getShareOwner')->willReturn('synthetic-owner');
		$this->share->method('getNodeId')->willReturn(23);
		$this->share->method('getToken')->willReturn('synthetic-link');
		$this->share->method('getPermissions')->willReturn(Constants::PERMISSION_READ);
		$this->share->method('getShareType')->willReturn(IShare::TYPE_LINK);
		$this->share->method('getSharedBy')->willReturn('synthetic-owner');
		$user = $this->createMock(Folder::class);
		$user->method('getFirstNodeById')->with(23)->willReturn($folder);
		$root = $this->createMock(IRootFolder::class);
		$root->method('getUserFolder')->with('synthetic-owner')->willReturn($user);
		$this->locks = $this->createMock(ILockingProvider::class);
		return new ReviewStore($root, $this->locks, new DraftLocator());
	}

	public static function markers(): array {
		return [[null, false], [str_repeat(' ', 5120), false], ['[1]', false], ['', true], ['{}', true], ['{"unknown":1}', true], ['1', false], ['"x"', false], ['null', false], ['true', false], ['{', false]];
	}

	#[DataProvider('markers')]
	public function testMarker(?string $marker, bool $expected): void {
		$store = $this->store($marker);
		self::assertSame($expected, $store->isReviewable($this->share));
		if (!$expected) {
			foreach (['open', 'save'] as $action) {
				try {
					$action === 'open' ? $store->open($this->share, ReviewKey::parse(self::KEY)) : $store->save($this->share, ReviewKey::parse(self::KEY), $this->body(), 0);
					self::fail('Expected notReviewable.');
				} catch (ReviewRefused $e) { self::assertSame(403, $e->status); self::assertSame('notReviewable', $e->getMessage()); }
			}
		}
	}

	public static function protocol(): array {
		$rows = json_decode(file_get_contents(dirname(__DIR__, 2) . '/../test/fixtures/save-protocol.json'), true, 512, JSON_THROW_ON_ERROR);
		return array_combine(array_column($rows, 'description'), array_map(static fn ($row) => [$row], $rows));
	}

	#[DataProvider('protocol')]
	public function testProtocol(array $row): void {
		$store = $this->store();
		$key = ReviewKey::parse(self::KEY);
		if ($row['stored'] !== null) { $this->files['ada' . $key->fileSuffix()] = $row['stored']; }
		$lockName = 'gloss-review/synthetic-link/' . substr(hash('sha256', self::KEY), 0, 16);
		$acquire = $this->locks->expects(self::once())->method('acquireLock')->with($lockName, ILockingProvider::LOCK_EXCLUSIVE);
		if ($row['locked']) { $acquire->willThrowException(new LockedException($lockName)); }
		$this->locks->expects($row['locked'] ? self::never() : self::once())->method('releaseLock')->with($lockName, ILockingProvider::LOCK_EXCLUSIVE);
		try {
			$result = $store->save($this->share, $key, $row['request']['review'], $row['request']['baseRevision']);
			self::assertSame(200, $row['expected']['status']);
			self::assertSame($row['expected']['body'], ['revision' => $result->revision]);
			self::assertSame($row['expected']['sentNow'], $result->sentNow);
			self::assertSame(42, $result->fileId);
			self::assertSame('Ada Lovelace', $result->name);
			self::assertStringStartsWith('/owner/files/Review reviews/', $result->path);
		} catch (ReviewRefused $e) {
			self::assertSame($row['expected']['status'], $e->status);
			$answer = ['error' => $e->getMessage()];
			if ($e->revision !== null) { $answer['revision'] = $e->revision; }
			self::assertSame($row['expected']['body'], $answer);
		}
		self::assertSame($row['expected']['written'] ? 1 : 0, $this->writes);
	}

	public function testSaveResultCarriesServerDraftFileForInitialSaveAndRetry(): void {
		$store = $this->store();
		$key = ReviewKey::parse(self::KEY);
		$body = json_encode(array_merge(json_decode($this->body(), true), ['draft' => ['file' => 'chapter.typ']]));
		foreach ([0, 1] as $attempt) {
			$result = $store->save($this->share, $key, $body, 0);
			self::assertSame('paper.typ', $result->draftFile);
		}
	}

	public function testSendNotificationUsesServerDraftNameInsteadOfReviewBody(): void {
		$store = $this->store();
		$body = json_encode(array_merge(json_decode($this->body(sent: true), true), ['draft' => ['file' => 'reviewer-chosen.typ']]));
		$result = $store->save($this->share, ReviewKey::parse(self::KEY), $body, 0);
		self::assertTrue($result->sentNow);
		$notification = $this->createMock(\OCP\Notification\INotification::class);
		foreach (['setApp', 'setUser', 'setDateTime', 'setObject'] as $setter) {
			$notification->method($setter)->willReturnSelf();
		}
		$notification->expects(self::once())->method('setSubject')->with('review_sent', [
			'name' => 'Ada Lovelace', 'draft' => 'paper.typ', 'fileId' => 42, 'path' => $result->path,
		])->willReturnSelf();
		$manager = $this->createMock(\OCP\Notification\IManager::class);
		$manager->method('createNotification')->willReturn($notification);
		$manager->expects(self::once())->method('notify')->with($notification);
		$logger = $this->createMock(\Psr\Log\LoggerInterface::class);
		$logger->expects(self::never())->method('error');
		(new SentNotifier($manager, $this->createMock(\OCP\AppFramework\Utility\ITimeFactory::class), $logger))->notify($this->share, $result);
	}

	public static function nonStringDraftFiles(): array {
		return [[(object) []], [[]], [42], [true], [null]];
	}

	#[DataProvider('nonStringDraftFiles')]
	public function testNonStringDraftFileDoesNotChangeServerNotificationMetadata(mixed $draftFile): void {
		$store = $this->store();
		$key = ReviewKey::parse(self::KEY);
		$body = json_encode(array_merge(json_decode($this->body(name: 'Synthetic reviewer'), true), ['draft' => ['file' => $draftFile]]));
		foreach ([0, 1] as $attempt) {
			$result = $store->save($this->share, $key, $body, 0);
			self::assertSame(1, $result->revision);
			self::assertFalse($result->sentNow);
			self::assertSame('paper.typ', $result->draftFile);
			self::assertSame($body, $store->open($this->share, $key)->content);
			self::assertSame(1, $this->writes);
		}
	}

	public function testFolderCreatedOnlyOnSaveAndOpenUsesSuffix(): void {
		$store = $this->store(exists: false);
		$key = ReviewKey::parse(self::KEY);
		self::assertNull($store->open($this->share, $key));
		self::assertFalse($this->made);
		$store->save($this->share, $key, $this->body(), 0);
		self::assertTrue($this->made);
		self::assertArrayHasKey('ada' . $key->fileSuffix(), $this->files);
		$this->files['other' . ReviewKey::parse('1111111111111111')->fileSuffix()] = $this->body(9);
		$opened = $store->open($this->share, $key);
		self::assertSame($this->body(), $opened->content);
		self::assertSame(1, $opened->revision);
		$store->save($this->share, $key, $this->body(2, false, 'Grace Hopper'), 1);
		self::assertArrayHasKey('ada' . $key->fileSuffix(), $this->files);
		self::assertCount(2, $this->files);
	}

	public static function invalidReviews(): array {
		$valid = ['format' => 1, 'revision' => 1, 'name' => 'Ada', 'sent' => false, 'items' => []];
		$cases = [[str_repeat(' ', 1048577), 413, 'tooLarge'], ['{"nested":' . str_repeat('[', 17) . '0' . str_repeat(']', 17) . '}', 400, 'badReview'], ['null', 400, 'badReview']];
		foreach (['format' => 0, 'revision' => 1.5, 'name' => '', 'sent' => 1, 'items' => (object) []] as $field => $value) { $cases[] = [json_encode(array_replace($valid, [$field => $value])), 400, 'badReview']; }
		$cases[] = [json_encode(array_replace($valid, ['name' => str_repeat('a', 101)])), 400, 'badReview'];
		$cases[] = [json_encode(array_diff_key($valid, ['revision' => true])), 400, 'badReview'];
		return $cases;
	}

	#[DataProvider('invalidReviews')]
	public function testLimits(string $body, int $status, string $code): void {
		$store = $this->store();
		try { $store->save($this->share, ReviewKey::parse(self::KEY), $body, 0); self::fail('Expected refusal.'); }
		catch (ReviewRefused $e) { self::assertSame($status, $e->status); self::assertSame($code, $e->getMessage()); }
		self::assertSame(0, $this->writes);
	}

	public function testFullOnlyCountsReviewFilesAndAllowsUpdates(): void {
		$store = $this->store();
		for ($i = 0; $i < 50; $i++) { $this->files['review-' . sprintf('%016x', $i) . '.json'] = $this->body(); }
		try { $store->save($this->share, ReviewKey::parse(self::KEY), $this->body(), 0); self::fail('Expected full.'); }
		catch (ReviewRefused $e) { self::assertSame(409, $e->status); self::assertSame('full', $e->getMessage()); }
		unset($this->files['review-0000000000000000.json']);
		$this->files['notes.json'] = '{}';
		$store->save($this->share, ReviewKey::parse(self::KEY), $this->body(), 0);
		$store->save($this->share, ReviewKey::parse(self::KEY), $this->body(2), 1);
		self::assertSame(2, $this->writes);
	}

	public function testBlockedFolder(): void {
		$store = $this->store(blocked: true);
		$this->expectException(ReviewRefused::class);
		$this->expectExceptionMessage('reviewsBlocked');
		$store->save($this->share, ReviewKey::parse(self::KEY), $this->body(), 0);
	}

	public function testLockReleasedAfterWriteException(): void {
		$store = $this->store();
		$this->throwWrite = true;
		$this->locks->expects(self::once())->method('releaseLock');
		$this->expectException(RuntimeException::class);
		$this->expectExceptionMessage('Synthetic write failure.');
		$store->save($this->share, ReviewKey::parse(self::KEY), $this->body(), 0);
	}

	public function testLostAnswersLeaveOneFileAndOneSendTransition(): void {
		$store = $this->store();
		foreach ([1, 2, 3] as $revision) {
			$body = $this->body($revision, $revision === 3);
			$first = $store->save($this->share, ReviewKey::parse(self::KEY), $body, $revision - 1);
			$retry = $store->save($this->share, ReviewKey::parse(self::KEY), $body, $revision - 1);
			self::assertSame($revision, $retry->revision);
			self::assertSame($revision === 3, $first->sentNow);
			self::assertFalse($retry->sentNow);
			self::assertCount(1, $this->files);
			self::assertSame($revision, $this->writes);
		}
	}

	public function testAcceptsExactlyOneMiBAndFallbackSlug(): void {
		$store = $this->store();
		$body = $this->body(name: '!!!');
		$body .= str_repeat(' ', 1048576 - strlen($body));
		$store->save($this->share, ReviewKey::parse(self::KEY), $body, 0);
		self::assertArrayHasKey('reviewer' . ReviewKey::parse(self::KEY)->fileSuffix(), $this->files);
	}
}
