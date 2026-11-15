<?php

declare(strict_types=1);

return [
	'routes' => [
		['name' => 'review#page', 'url' => '/r/{token}', 'verb' => 'GET'],
		['name' => 'review#draft', 'url' => '/r/{token}/draft', 'verb' => 'GET'],
		['name' => 'review#pdf', 'url' => '/r/{token}/pdf', 'verb' => 'GET'],
		['name' => 'review#open', 'url' => '/r/{token}/review/open', 'verb' => 'POST'],
		['name' => 'review#save', 'url' => '/r/{token}/review', 'verb' => 'POST'],
	],
];
