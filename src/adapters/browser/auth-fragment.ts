// Password form POSTs cannot carry URL fragments through the server redirect.
export function restoreAuthFragment(scope: string): void {
  const prefix = 'gloss-auth-fragment:'
  try {
    const fragment = sessionStorage.getItem(prefix + scope)
    if (!location.hash && fragment?.startsWith('#')) {
      history.replaceState(history.state, '', location.pathname + location.search + fragment)
    }
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(prefix)) sessionStorage.removeItem(key)
    }
  } catch { /* Storage may be unavailable. */ }
}
