<?php

declare(strict_types=1);

namespace OC\Hooks;

// The OCP package references this internal interface without shipping it.
interface Emitter {
	public function connect($scope, $method, $callback);
	public function emit($scope, $method, array $arguments = []);
}
