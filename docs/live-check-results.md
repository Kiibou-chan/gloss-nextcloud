# Release live check

This round starts from review-app `78fe2ae` on `rvw-fr-lf2` and fixes the two Important branch-end findings.
The remaining review findings retain their previous no-change ruling.
`$GLOSS_WORK` denotes the workspace containing the checkouts, archive, and shots folders.
Current Chromium shots and job logs are in `$GLOSS_WORK/shots/final3/`.
Screenshot paths below are relative to its `chromium/` folder.
Earlier evidence remains in `../final2/` and `../final/`.

## Regression checks

The password form stores only the fragment under a sessionStorage key scoped by the share token's SHA-256 digest.
The share token, password, and CSRF token are absent from the stash.
The review restores that fragment with `history.replaceState` before constructing the session, preserves an explicit fragment, and clears matching or mismatched stashes.
Vitest covers wrong-password resubmission, unavailable storage, explicit fragments, mismatched scopes, and restoration before a remembered key can be selected.
PHPUnit verifies the form scope and the review template values.

CSRF refresh uses the exact URL supplied by `linkToRoute('core.CSRFToken.index')`, without deriving a URL from the web root.
The route and nonce mechanism were verified through `scripts/dev-nc.sh read-source` against Nextcloud's CSRF controller, router, CSP middleware, and nonce manager.
Tests pin `/cloud/index.php/csrftoken` and `/nextcloud/index.php/csrftoken`, including the stalled refresh path.
The new regression tests were run red before their fixes.

A clean build of `js/gloss-review.js` matches the committed bundle.
`npm run check -- -- --maxWorkers=2` passes 60 test files and 996 tests, including type and structure checks.
`scripts/php.sh test` passes 105 tests and 922 assertions.
All heavy jobs use `HEAVY_MODE=none` through `$GLOSS_WORK/../../tools/heavy-job.sh`.

## Live results

The archive is installed on the disposable Nextcloud 33 instance at port 8090, with debug disabled.
The installed bundle SHA-256 is `451831a6429977ed89f924f024cf422acadbb9abdd30f18d2be23d778e6b25b9`.
The installed manifest SHA-256 is `bae65ef78c106990df8a59edf8bb984eece4e04885d49f326e1b27b6229031e8`.
Both match the archive bytes, and Gloss 0.1.0 is enabled.

| Chromium scene | Assertions and visual inspection, light and dark |
| --- | --- |
| `password-lapse` | The actual password form preserves the fragment without another navigation to the link, and a fresh browser context loads Ada's saved flourish edit; a forced stale CSRF request refreshes and saves; ended-session wording is readable; reauthentication restores both flourish and warble edits and reaches Saved. |
| `editor` | Editor changes and comment cards are legible; wide and narrow layouts retain reachable final card buttons above the footer. |
| `input-prompts` | Typing before a name focuses the name field and shows the refusal; keyboard selection opens no comment prompt; pointer selection opens the comment form without overlap. |
| `review-link` | The review link and Copy feedback are readable; a fresh browser context opens the saved review with Ada's name and the flourish edit. |

All eight scene/theme results pass.
The light and dark screenshots, including intermediate states and editor layout shots, were inspected visually.
One review file remains in `Review reviews`, confirmed with `scripts/dev-nc.sh count-reviews` after the final scene.
Password shares are removed by the scene's finally block, and fixtures contain only synthetic garden text.

The development Apache front controller still generated `/csrftoken` after one attempt to disable pretty URLs with the disposable helper.
The prior rewrite base was restored with `scripts/dev-nc.sh pretty-urls true`.
As approved by the coordinator, the password scene supplies `/index.php/csrftoken` in the page's template attribute before bundle initialisation when necessary.
The live client forwards that URL, receives a successful token refresh, and retries the stale request successfully.
Server generation is covered separately by the PHPUnit template-value test; the live instance did not independently demonstrate non-pretty server generation.
The live save sequence includes HTTP 200, 412, 200, 412, and 404 before reauthentication, then a successful recovered save, with no requests during the 6.5-second ended-session observation.

## Reproducibility

The archive is rebuilt with `scripts/package.sh $GLOSS_WORK/archive/` from a clean detached checkout of the branch head.
`scripts/package.sh` changed in the earlier round to reject dirty runtime paths and package committed allowlisted files with deterministic archive metadata.
The instance is reset with `GLOSS_DEV_NC_FORCE_RESET=1 GLOSS_DEV_NC_COPY=1 scripts/dev-nc.sh reset`.
The archive is installed with `scripts/dev-nc.sh install-archive $GLOSS_WORK/archive/gloss-0.1.0.tar.gz`, followed by `scripts/dev-nc.sh debug false` and `scripts/dev-nc.sh archive-probe`.
Archive bundle and manifest bytes are compared using `tar -xOf <archive> gloss/js/gloss-review.js | sha256sum` and the corresponding manifest command.
Scenes run sequentially with `GLOSS_SHOTS_SKIP_SYNC=1 node scripts/shots.mjs <scene> --out $GLOSS_WORK/shots/final3/chromium`, through the heavy-job helper.
The runner empties the review folder before each theme.
