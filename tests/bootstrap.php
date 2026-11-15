<?php

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';

// The API package deliberately leaves autoloading to the consuming app.
spl_autoload_register(static function (string $class): void {
	if (str_starts_with($class, 'OCP\\')) {
		$path = dirname(__DIR__) . '/vendor/nextcloud/ocp/' . str_replace('\\', '/', $class) . '.php';
		if (is_file($path)) {
			require $path;
		}
	}
});
