# Release live check

This fix-round-2 live check starts from review-app `7918fee` on `rvw-fr2c`.
The refreshed archive contains commit `7f7ca45` on `rvw-fr2d`, including the unplaced panel typography fix.
The JavaScript bundle remains byte-identical to the earlier archive.
`$GLOSS_WORK` denotes the workspace containing the checkouts, archive, and shots folders.
Current shots, safe DOM probes, result JSON, inspection contact sheets, and job logs are in `$GLOSS_WORK/shots/final4/`.
Screenshot paths below are relative to that folder.
The refreshed unplaced shots, live typography probes, and job logs are in `$GLOSS_WORK/shots/final5/`.
Earlier evidence remains in `../final3/`, `../final2/`, and `../final/`.

## Regression checks

The password form stores only the fragment under a sessionStorage key scoped by the share token's SHA-256 digest.
The share token, password, and CSRF token are absent from the stash.
The review restores that fragment with `history.replaceState` before constructing the session, preserves an explicit fragment, and clears matching or mismatched stashes.
Vitest covers wrong-password resubmission, unavailable storage, explicit fragments, mismatched scopes, and restoration before a remembered key can be selected.
PHPUnit verifies the form scope and the review template values.

CSRF refresh uses the exact URL supplied by `linkToRoute('core.CSRFToken.index')`, without deriving a URL from the web root.
The route and nonce mechanism were verified through `scripts/dev-nc.sh read-source` against Nextcloud's CSRF controller, router, CSP middleware, and nonce manager.
Tests pin `/cloud/index.php/csrftoken` and `/nextcloud/index.php/csrftoken`, including the stalled refresh path.
The earlier regression tests were run red before their fixes.
The new storage regression first failed for legacy paths without the share token, including a token-prefix collision.
Migration now requires the current path to end with `/${shareToken}` and leaves unrelated legacy keys unread and untouched.
The storage test then passed all eight cases.

A clean build of `js/gloss-review.js` matches the committed bundle.
`npm run check -- -- --maxWorkers=2` passes 61 test files and 1,020 tests, including type and structure checks.
`scripts/php.sh test` passes 105 tests and 922 assertions.
All heavy jobs use `HEAVY_MODE=none` through `$GLOSS_WORK/../../tools/heavy-job.sh`.

## Live results

The archive is installed on the disposable Nextcloud 33 instance at port 8090, with debug disabled.
The archive is `$GLOSS_WORK/archive/gloss-0.1.0.tar.gz`, replacing the previous bundle.
Its SHA-256 is `c10f24d55ef0daa3c9f8f36b35103755d2b6dfa4c1cef2db96a4ea9e3957ad1f`.
The archive bundle is 853,235 bytes, matching the installed bundle and the committed `js/gloss-review.js`.
The installed bundle SHA-256 is `689a04ad8b1cdb7ab084025f2f3bcae4a3998f177e5e0b3d28b24e2447e41eeb`.
The installed manifest SHA-256 is `bae65ef78c106990df8a59edf8bb984eece4e04885d49f326e1b27b6229031e8`.
Both match the archive bytes, and Gloss 0.1.0 is enabled, as recorded in `../final5/archive-probe.txt`.

| Browser and scene | Light result and shot | Dark result and shot | Assertions and visual inspection |
| --- | --- | --- | --- |
| Chromium `password-lapse`, pretty URLs disabled | PASS `chromium/index-mode/password-lapse-light.png` | PASS `chromium/index-mode/password-lapse-dark.png` | Password prompts, saved flourish, stale-token recovery, ended-session wording, and restored flourish and warble are readable; both plain-link path forms find the saved review after re-entering the password. |
| Chromium `password-lapse`, pretty URLs restored | PASS `chromium/password-lapse-light.png` | PASS `chromium/password-lapse-dark.png` | The fragment survives the actual password form, a fresh browser context restores Ada's review, and both plain-link path forms preserve its key, edit, and overall comment after another password prompt. |
| Chromium `input-prompts` | PASS `chromium/input-prompts-light.png` | PASS `chromium/input-prompts-dark.png` | N3 focuses the empty name field without inserting the refused character into either the name or draft; keyboard selection opens no comment form, and pointer selection opens a legible form without overlap. |
| Chromium `unplaced` | PASS `../final5/chromium/unplaced-light.png` | PASS `../final5/chromium/unplaced-dark.png` | The h2 matches the panel labels in size and aligns with Your review link, with no horizontal section padding, in both themes; struck stones and underlined pebbles remain visible, Saved is shown, and the 253-byte original item remains byte-identical after another save. |
| Chromium `editor` | PASS `chromium/editor-light.png` | PASS `chromium/editor-dark.png` | Three changes and one comment survive reload; insertion, deletion, and comment cards are legible, and final buttons remain above the footer at 1,600px and 640px. |
| Chromium `not-set-up` | PASS `chromium/not-set-up-light.png` | PASS `chromium/not-set-up-dark.png` | The explanatory sentence and read-only synthetic draft are clear, with no name or send controls; contrast is 13.59:1 in light and 12.20:1 in dark, at opacity 1. |
| Chromium `sent` | PASS `chromium/sent-light-after-delete.png` | PASS `chromium/sent-dark-after-delete.png` | N1 deletes the sent review through owner WebDAV inside Node, reopens its link, retains Review sent and read-only content, removes item buttons, and asserts zero review files after two seconds. |
| Chromium `review-link` | PASS `chromium/review-link-light.png` | PASS `chromium/review-link-dark.png` | The link and manual-copy fallback are readable; a fresh browser context restores Ada's name and flourish edit. |
| Chromium `both` | PASS `chromium/both-light.png` | PASS `chromium/both-dark.png` | Editor, PDF text, yellow marks, and cards are visible; wide and stacked narrow layouts retain reachable final buttons, and the settled dark shot retains the PDF. |
| Firefox `both` | PASS `firefox/both-firefox-light.png` | PASS `firefox/both-firefox-dark.png` | Editor changes, rendered PDF, marks, and comment cards are clear in both themes; footer and stacked-layout assertions pass at both widths. |
| Firefox `pdf` | PASS `firefox/pdf-firefox-light.png` | PASS `firefox/pdf-firefox-dark.png` | The rendered synthetic garden, stones highlight, Alpha plants selection prompt, and comment controls are legible; wide and narrow final buttons remain reachable. |

All 22 earlier scene/theme results pass, including the additional password configuration run.
The two refreshed unplaced theme results also pass, with live probes measuring both the heading and review-link label at 15px and their left edges at 1,048px.
All 99 earlier light and dark shots were inspected, including password intermediate states, before and after deletion, layout shots, and settled PDF shots.
Both refreshed final unplaced shots were visually inspected for matching label size, aligned text, and visible struck and underlined proposal words.
Each PNG has a neighbouring `.probe.json`, and each scene has a browser-specific `-results.json` listing every captured path.
N11 measures line pitch at `22.078125px` before and after entering the name in both themes, with font size `14.25px` and computed line height `22.0875px` unchanged.
Some default editor and combined-view captures retain the side panel's scroll position, cropping the top of the overall-comment field; the dedicated layout shots demonstrate that the final card buttons are reachable above the footer.
The headless review-link run displays Copy failed; select the link and copy it, so clipboard copying itself was not demonstrated, while the fallback and reopened link were verified.
No failing app behaviour was found.

Both `/index.php/apps/gloss/r/...` and `/apps/gloss/r/...` are served and find the remembered review after password submission, with no fragment on the entry link.
The password scene clears authentication before each of those reopenings.
The disposable helper disables pretty URLs for the first run and restores the saved rewrite base with `pretty-urls true` for the second run.
The disabled configuration was repeated after strengthening the plain-link password assertion, followed by another restoration and final sent scene.
This Apache instance still generates `/csrftoken` in both configurations, so it cannot demonstrate a server-generated `/index.php/csrftoken` URL.
N10 uses the unmodified server-generated URL and asserts HTTP 412, refresh 200, and retry 200 in that order in every password run.
No template URL is injected or replaced.
The complete save sequence is HTTP 200, 412, 200, 412, 404, and 200, with no requests during the 6.5-second ended-session observation.
Password shares are removed in the scene's finally block, and fixtures contain only synthetic garden text.
The earlier final sent scene left zero direct files in `Review reviews`.
After the refreshed run, `scripts/dev-nc.sh count-reviews` reports one direct review file left by the dark unplaced scene, whose successful save and preservation are recorded in `../final5/jobs/unplaced.log`.

## Reproducibility

The refreshed archive is rebuilt with `scripts/package.sh $GLOSS_WORK/archive/` from a clean detached checkout of branch head `7f7ca45`, after committing the CSS fix and heading test.
Later scene and results changes do not alter the packaged runtime files.
`scripts/package.sh` changed in the earlier round to reject dirty runtime paths and package committed allowlisted files with deterministic archive metadata.
The instance is reset with `GLOSS_DEV_NC_FORCE_RESET=1 GLOSS_DEV_NC_COPY=1 scripts/dev-nc.sh reset`.
The archive is installed with `scripts/dev-nc.sh install-archive $GLOSS_WORK/archive/gloss-0.1.0.tar.gz`, followed by `scripts/dev-nc.sh debug false` and `scripts/dev-nc.sh archive-probe`.
Archive bundle and manifest bytes are compared using `tar -xOf <archive> gloss/js/gloss-review.js | sha256sum` and the corresponding manifest command.
Scenes run sequentially with `GLOSS_SHOTS_SKIP_SYNC=1 node scripts/shots.mjs <scene> --out $GLOSS_WORK/shots/final4/chromium`, through the heavy-job helper.
Firefox uses `--browser firefox --out $GLOSS_WORK/shots/final4/firefox`.
The disabled-pretty-URL password run uses `--out $GLOSS_WORK/shots/final4/chromium/index-mode`.
The runner empties the review folder before each theme.
The earlier final scene was sent, including the owner deletion and reopen assertion.
The refreshed run executes only unplaced in Chromium, in light and dark, with `GLOSS_SHOTS_SKIP_SYNC=1` and output `$GLOSS_WORK/shots/final5/chromium`.
The external `final5/verify-unplaced.mjs` wrapper adds live assertions for heading size, weight, alignment, zero horizontal padding, and visible deletion and insertion decorations to the existing scene.
