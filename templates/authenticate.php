<?php
/** @var array $_ */
?>
<form data-fragment-scope="<?php p($_['fragmentScope']); ?>" class="guest-box" method="post" action="<?php p($_['action']); ?>">
	<h2>Enter the share password</h2>
	<?php if ($_['wrongpw']): ?>
		<p role="alert">That password is incorrect. Please try again.</p>
	<?php endif; ?>
	<input type="hidden" name="requesttoken" value="<?php p(\OCP\Util::callRegister()); ?>">
	<label for="gloss-share-password">Password</label>
	<input id="gloss-share-password" name="password" type="password" autocomplete="current-password" required autofocus>
	<button type="submit">Open review</button>
</form>
<script nonce="<?php p(\OCP\Server::get(\OC\Security\CSP\ContentSecurityPolicyNonceManager::class)->getNonce()); ?>">
(() => {
	const form = document.querySelector('form[data-fragment-scope]');
	form.addEventListener('submit', () => {
		try {
			if (location.hash) {
				for (const key of Object.keys(sessionStorage)) {
					if (key.startsWith('gloss-auth-fragment:')) sessionStorage.removeItem(key);
				}
				sessionStorage.setItem('gloss-auth-fragment:' + form.dataset.fragmentScope, location.hash);
			}
		} catch { /* Storage may be unavailable. */ }
	});
})();
</script>
