<?php

declare(strict_types=1);

namespace OCA\Gloss\Tests\Unit\Notification;

use OCA\Gloss\AppInfo\Application;
use OCA\Gloss\Notification\Notifier;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\L10N\IFactory;
use OCP\Notification\AlreadyProcessedException;
use OCP\Notification\INotification;
use OCP\Notification\UnknownNotificationException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class NotifierTest extends TestCase {
	private function notification(string $app = 'gloss', string $subject = 'review_sent'): INotification {
		$n = $this->createMock(INotification::class);
		$n->method('getApp')->willReturn($app);
		$n->method('getSubject')->willReturn($subject);
		$n->method('getUser')->willReturn('synthetic-owner');
		$n->method('getSubjectParameters')->willReturn([
			'name' => 'Ada <Lovelace>', 'draft' => 'paper.typ', 'fileId' => 42, 'path' => '/synthetic-owner/files/Review reviews/ada.json',
		]);
		return $n;
	}

	public function testRichSubjectAndFileLinkUseRequestedLanguage(): void {
		$root = $this->createMock(IRootFolder::class);
		$folder = $this->createMock(Folder::class);
		$root->expects(self::once())->method('getUserFolder')->with('synthetic-owner')->willReturn($folder);
		$folder->expects(self::once())->method('getFirstNodeById')->with(42)->willReturn($this->createMock(File::class));
		$urls = $this->createMock(IURLGenerator::class);
		$urls->expects(self::once())->method('linkToRouteAbsolute')->with('files.viewcontroller.showFile', ['fileid' => 42])->willReturn('https://cloud.example/f/42');
		$l10n = $this->createMock(IL10N::class);
		$l10n->method('t')->willReturnCallback(static fn (string $text, array $parameters = []) => $parameters === [] ? $text : vsprintf($text, $parameters));
		$factory = $this->createMock(IFactory::class);
		$factory->expects(self::once())->method('get')->with('gloss', 'en_GB')->willReturn($l10n);
		$n = $this->notification();
		$n->expects(self::once())->method('setRichSubject')->with('{reviewer} sent a review of {draft}', [
			'reviewer' => ['type' => 'highlight', 'id' => 'reviewer', 'name' => 'Ada <Lovelace>'],
			'draft' => ['type' => 'file', 'id' => '42', 'name' => 'paper.typ', 'path' => '/synthetic-owner/files/Review reviews/ada.json', 'link' => 'https://cloud.example/f/42'],
		])->willReturnSelf();
		$n->expects(self::once())->method('setParsedSubject')->with('Ada <Lovelace> sent a review of paper.typ')->willReturnSelf();
		$n->expects(self::once())->method('setLink')->with('https://cloud.example/f/42')->willReturnSelf();
		self::assertSame($n, (new Notifier($root, $urls, $factory))->prepare($n, 'en_GB'));
	}

	public static function unknownNotifications(): array {
		return [['another_app', 'review_sent'], ['gloss', 'another_subject']];
	}

	#[DataProvider('unknownNotifications')]
	public function testUnknownNotification(string $app, string $subject): void {
		$root = $this->createMock(IRootFolder::class);
		$root->expects(self::never())->method('getUserFolder');
		$this->expectException(UnknownNotificationException::class);
		(new Notifier($root, $this->createMock(IURLGenerator::class), $this->createMock(IFactory::class)))->prepare($this->notification($app, $subject), 'en_GB');
	}

	public static function missingFiles(): array {
		return [[false], [true]];
	}

	#[DataProvider('missingFiles')]
	public function testDeletedReviewIsAlreadyProcessed(bool $throws): void {
		$root = $this->createMock(IRootFolder::class);
		$folder = $this->createMock(Folder::class);
		$root->method('getUserFolder')->willReturn($folder);
		if ($throws) {
			$folder->method('getFirstNodeById')->willThrowException(new NotFoundException());
		} else {
			$folder->method('getFirstNodeById')->willReturn(null);
		}
		$this->expectException(AlreadyProcessedException::class);
		(new Notifier($root, $this->createMock(IURLGenerator::class), $this->createMock(IFactory::class)))->prepare($this->notification(), 'en_GB');
	}

	public function testApplicationRegistersNotifier(): void {
		$context = $this->createMock(IRegistrationContext::class);
		$context->expects(self::once())->method('registerNotifierService')->with(Notifier::class);
		(new \ReflectionClass(Application::class))->newInstanceWithoutConstructor()->register($context);
	}
}
