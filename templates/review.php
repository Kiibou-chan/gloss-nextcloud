<?php
/** @var array $_ */
?>
<div id="gloss-review" data-token="<?php p($_['token']); ?>">
	<header class="gr-head">
		<div class="gr-title"><?php p($_['draftName']); ?></div>
		<label class="gr-who">Your name <input id="gr-name" type="text" autocomplete="name"></label>
		<span id="gr-status" class="gr-status" role="status"></span>
		<button id="gr-send" type="button" class="primary">Send review</button>
	</header>
	<main class="gr-body">
		<article id="gr-text" class="gr-text" aria-label="Draft"></article>
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
