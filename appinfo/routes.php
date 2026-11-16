<?php

declare(strict_types=1);

return [
	'routes' => [
		['name' => 'review#page', 'url' => '/r/{token}', 'verb' => 'GET'],
		['name' => 'review#showShare', 'url' => '/r/{token}/view', 'verb' => 'GET'],
		['name' => 'review#showAuthenticate', 'url' => '/r/{token}/authenticate', 'verb' => 'GET'],
		['name' => 'review#authenticate', 'url' => '/r/{token}/authenticate', 'verb' => 'POST'],
		['name' => 'review#draft', 'url' => '/r/{token}/draft', 'verb' => 'GET'],
		['name' => 'review#pdf', 'url' => '/r/{token}/pdf', 'verb' => 'GET'],
		['name' => 'review#open', 'url' => '/r/{token}/review/open', 'verb' => 'POST'],
		['name' => 'review#save', 'url' => '/r/{token}/review', 'verb' => 'POST'],
	],
];
