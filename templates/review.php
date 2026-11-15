<?php
/** @var array $_ */
?>
<div id="gloss-review" data-token="<?php p($_['token']); ?>" data-has-pdf="<?php p($_['hasPdf'] ? '1' : ''); ?>" data-worker="<?php p($_['worker']); ?>" data-view="editor">
	<header class="gr-head">
		<div id="gr-title" class="gr-title"><?php p($_['draftName']); ?></div>
		<div class="gr-views" role="group" aria-label="View" <?php if (!$_['hasPdf']) { p('hidden'); } ?>>
			<button type="button" id="gr-view-editor" aria-pressed="true">Editor</button>
			<button type="button" id="gr-view-pdf" aria-pressed="false">PDF</button>
			<button type="button" id="gr-view-both" aria-pressed="false">Both</button>
		</div>
		<label class="gr-who">Your name <input id="gr-name" type="text" autocomplete="name"></label>
		<span id="gr-status" class="gr-status" role="status"></span>
		<button id="gr-send" type="button" class="primary">Send review</button>
	</header>
	<main class="gr-body">
		<article id="gr-text" class="gr-text" aria-label="Draft, editable"></article>
		<article id="gr-pdf" class="gr-pdf" aria-label="Draft as PDF" hidden></article>
		<aside class="gr-side">
			<div id="gr-hint" class="gr-hint">Type in the editor to propose new wording; your changes show struck and underlined.
				Select words in the editor or the PDF to comment on them.</div>
			<form id="gr-form" class="gr-form" hidden>
				<blockquote id="gr-quote" class="gr-quote"></blockquote>
				<label>Comment <textarea id="gr-comment" rows="3"></textarea></label>
				<div class="gr-actions">
					<button type="submit" class="primary">Add</button>
					<button type="button" id="gr-cancel">Cancel</button>
				</div>
			</form>
			<div id="gr-count" class="gr-count"></div>
			<ol id="gr-items" class="gr-items"></ol>
		</aside>
	</main>
</div>
