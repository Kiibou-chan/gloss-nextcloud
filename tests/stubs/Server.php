<?php

declare(strict_types=1);

// Minimal global service locator for response construction in the API-only test environment.
class OC {
	public static ?\OCP\IServerContainer $server = null;
}

// Script dependencies are normally supplied by the Nextcloud runtime.
class_alias(GlossTestScriptDependency::class, 'OC\\AppScriptDependency');
class GlossTestScriptDependency {
	public function __construct(string $app, array $dependencies) {
	}
	public function addDep(string $dependency): void {
	}
}

class OC_Util {
	public static function addStyle(string $app, string $file): void {
	}
}
