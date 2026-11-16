<?php
/** @var array $_ */
?>
<form class="guest-box" method="post" action="<?php p($_['action']); ?>">
	<h2>Enter the share password</h2>
	<?php if ($_['wrongpw']): ?>
		<p role="alert">That password is incorrect. Please try again.</p>
	<?php endif; ?>
	<input type="hidden" name="requesttoken" value="<?php p(\OCP\Util::callRegister()); ?>">
	<label for="gloss-share-password">Password</label>
	<input id="gloss-share-password" name="password" type="password" autocomplete="current-password" required autofocus>
	<button type="submit">Open review</button>
</form>
