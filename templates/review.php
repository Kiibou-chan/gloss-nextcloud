<?php
/** @var array $_ */
?>
<div id="gloss-review" data-base="<?php p($_['base']); ?>" data-webroot="<?php p($_['webroot']); ?>" data-reviewable="<?php p($_['reviewable'] ? '1' : ''); ?>" data-token="<?php p($_['token']); ?>" data-has-pdf="<?php p($_['hasPdf'] ? '1' : ''); ?>" data-worker="<?php p($_['worker']); ?>" data-view="editor">
	<header class="gr-head"></header>
	<main class="gr-body">
		<article id="gr-text" class="gr-text" aria-label="Draft, editable"></article>
		<article id="gr-pdf" class="gr-pdf" aria-label="Draft as PDF" hidden></article>
		<aside class="gr-side"></aside>
	</main>
</div>
