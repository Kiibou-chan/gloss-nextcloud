<?php
/** @var array $_ */
?>
<div id="gloss-review" data-token="<?php p($_['token']); ?>" data-has-pdf="<?php p($_['hasPdf'] ? '1' : ''); ?>" data-worker="<?php p($_['worker']); ?>">
	<header class="gr-head">
		<div class="gr-title"><?php p($_['draftName']); ?></div>
		<div class="gr-views" role="group" aria-label="View" <?php if (!$_['hasPdf']) { p('hidden'); } ?>>
			<button type="button" id="gr-view-text" aria-pressed="true">Text</button>
			<button type="button" id="gr-view-pdf" aria-pressed="false">PDF</button>
		</div>
		<label class="gr-who">Your name <input id="gr-name" type="text" autocomplete="name"></label>
		<span id="gr-status" class="gr-status" role="status"></span>
		<button id="gr-send" type="button" class="primary">Send review</button>
	</header>
	<main class="gr-body">
		<article id="gr-text" class="gr-text" aria-label="Draft"></article>
		<article id="gr-pdf" class="gr-pdf" aria-label="Draft as PDF" hidden></article>
		<aside class="gr-side">
			<div id="gr-hint" class="gr-hint">Select words in the draft to comment on them or propose new wording.</div>
			<form id="gr-form" class="gr-form" hidden>
				<blockquote id="gr-quote" class="gr-quote"></blockquote>
				<label>Comment <textarea id="gr-comment" rows="3"></textarea></label>
				<label>New wording (optional) <textarea id="gr-proposal" rows="3"></textarea></label>
				<div class="gr-actions">
					<button type="submit" class="primary">Add</button>
					<button type="button" id="gr-cancel">Cancel</button>
				</div>
			</form>
			<ol id="gr-items" class="gr-items"></ol>
		</aside>
	</main>
</div>
