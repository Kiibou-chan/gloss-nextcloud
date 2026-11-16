# Release live check

The release archive is installed on the disposable Nextcloud 33 instance at port 8090, with debug disabled.
This fix round starts from review-app `c78a7a7` and corrects the four defects recorded below.
Current shots and job logs are in `$GLOSS_WORK/shots/final2/`.
Paths below are relative to that folder, and `{light,dark}` means both separately inspected images.
Unaffected historical checks explicitly use `../final/` paths and retain their original results.

The installed `js/gloss-review.js` SHA-256 is `7d3610cb46399bb8009a0c92d40f3ff95c5b9eca57cbe6a7b6790b8b862d5628`.
The installed `appinfo/info.xml` SHA-256 is `bae65ef78c106990df8a59edf8bb984eece4e04885d49f326e1b27b6229031e8`.
Both match the archive bytes, and `occ app:list` reports enabled Gloss 0.1.0.
A clean bundle build matches the committed bundle.
`npm run check -- -- --maxWorkers=2` passes all 59 test files and 989 tests.
`scripts/php.sh test` passes 104 tests and 919 assertions.
Regression tests were run red before the fixes, including PHP authentication, protected and passwordless refresh failures, inherited read-only fading, and footer measurements.
The live geometry probe also failed before the stacked-layout containment fix.

| Check | Scene assertions, light and dark | Shots and inspection |
| --- | --- | --- |
| H1, Chromium editor | Pass | `chromium/editor-{light,dark}.png` and `-layout-{1600,640}.png`: legible changes and four cards, with the final card buttons reachable above the footer at both widths. |
| H2, Chromium PDF | Pass | `chromium/pdf-{light,dark}.png`, `-layout-{1600,640}.png`, and `pdf-dark-settled.png`: readable PDF, visible stones mark, and Alpha plants comment form, with footer clearance in both layouts. |
| H2, Firefox PDF | Pass | `../final/firefox/pdf-firefox-{light,dark}.png` and `../final/firefox/settled/pdf-firefox-{light,dark}.png`: the same visible mark and selection form, with the light paper edge present. |
| H3, Chromium Both | Pass | `chromium/both-{light,dark}.png`, `-layout-{1600,640}.png`, and `both-dark-settled.png`: three columns at 1600 pixels, stacked content at 640 pixels, visible paper edges, and reachable final card controls. |
| H3, Firefox Both | Pass | `firefox/both-firefox-{light,dark}.png`, `-layout-{1600,640}.png`, and `both-firefox-dark-settled.png`: readable editor and PDF, complete paper edges, and the final card above the footer at both widths. |
| H4, Chromium search | Pass | `../final/chromium/search-{light,dark}-matches.png`: readable highlighted matches and search controls; `../final/chromium/search-{light,dark}.png`: visible go-to-line prompt without overlap. |
| H5, Chromium not set up | Pass | `chromium/not-set-up-{light,dark}.png`: correct warning, absent name and Send controls, and readable inactive draft text at 13.59:1 in light mode and 12.20:1 in dark mode. |
| H6, Chromium waiting | Pass | `../final/chromium/waiting-{light,dark}-retry.png`: correct retry sentence; `-versions.png`: one current version and no historical versions; final `.png`: Saved and one readable replacement card. |
| H7, Chromium review link | Pass | `../final/chromium/review-link-{light,dark}-copy.png`: readable link and Copy fallback; `-reopened.png`: Ada and the saved edit in a fresh context; final `.png`: restored review fits without overlap. |
| H8, Chromium overall | Pass | `../final/chromium/overall-{light,dark}.png`: synthetic text at the top of the panel, unchanged zero count, and Saving status at capture time. |
| H9, Chromium bell | Pass | `../final/chromium/bell-{light,dark}-notification.png`: readable owner notification naming Ada and paper.typ; final `.png`: sent review with readable cards; current editor contrast is verified in H10. |
| H10, Chromium sent | Pass | `chromium/sent-{light,dark}.png`: correct thanks, absent card buttons, and readable inactive editor text at 13.59:1 in light mode and 12.20:1 in dark mode. |
| Chromium input prompts | Pass | `chromium/input-prompts-{light,dark}-name.png`: correct refusal sentence and focused name; `-keyboard.png`: no comment form; `-pointer.png` and final `.png`: visible selection and comment form without overlap. |
| Chromium unplaced items | Pass | `chromium/unplaced-{light,dark}-saved.png`: saved stones comment; `-missing.png`: readable Could not place list after synthetic draft replacement; `-preserved.png` and final `.png`: list retained after a further save, with all 316 raw item bytes unchanged. |
| Chromium password lapse | Pass | `chromium/password-lapse-{light,dark}-direct.png` and `-password.png`: password prompt reached from the direct Gloss link; `-saved.png`: Saved with one change; `-ended.png`: session-ended sentence and browser-backup reassurance; `-restored.png` and final `.png`: Saved with both recovered changes. |

All 18 current browser/theme results pass across eight Chromium scenes and Firefox Both.
Every current PNG, including additional state and layout shots in both themes, was inspected visually.
One review file remains in `Review reviews`, confirmed with `scripts/dev-nc.sh count-reviews` after the final run.
Temporary password shares are deleted by the scenes, and the synthetic draft is restored after each unplaced-items run.
Earlier diagnostic failures are retained separately in `initial-tooling/`, and their assertions are superseded by the current results.

The current dark PDF and Both `*-dark-settled.png` shots wait another 1.5 seconds before capture.
They show readable PDF text and the delayed marks in Both mode.
Historical standalone Firefox PDF evidence remains in `../final/firefox/`.
There is no confirmed blank-PDF failure or missing light-mode paper edge.

## Verified fixes

Direct password-protected links now enter Nextcloud 33's `AuthPublicShareController` authentication flow.
The controller, middleware, share password checks, and CSRF form token mechanism were verified against the vendored Nextcloud sources through the read-only `scripts/dev-nc.sh read-source` command.
Gloss provides its own labelled password form and POST authenticate route, then redirects back to the review page.
The generated password remains in memory and the POST body, with no password in a URL or log.
Passwordless links retain their existing behaviour.
See `chromium/password-lapse-{light,dark}-direct.png` and `-password.png`.

The page template now exposes whether the share has a password.
Only a password-protected share's 404 resend after a 412 and one CSRF refresh becomes the existing session-ended failure.
Passwordless 404 responses retain the link-gone sentence, as covered by Vitest.
The live ended state uses the existing session-ended sentence and confirms that changes are kept in this browser.
Reloading the direct review link prompts for the password again.
Each theme records save responses 200, 412, and 404 before reauthentication, with the request count stable for 6.5 seconds afterwards.
Reauthentication recovers both edits, reaches Saved, and an owner WebDAV GET confirms both edits in the review file.
The final save returns 200, making four save requests per theme, without a retry loop.
See `chromium/password-lapse-{light,dark}-ended.png`, `-restored.png`, and `password-lapse-chromium-results.json`.

The page reserves the footer's occupied height, including its bottom inset.
At 1600 by 1000, the footer begins at y=939 and the panel is capped above it, with its own vertical scrolling.
At 640 pixels, the panel follows the stacked content in normal flow, and the public container scrolls to the final card above the footer.
The Chromium editor probe places the last card bottom at y=889.75, its final button bottom at y=877.75, and the footer top at y=947.
The review root keeps its intrinsic height so its bottom padding contributes to the scroll range.
Editor, PDF, and Both probes check both widths, the final card, every button on that card, bottom padding, and ancestor scroll dimensions.
Firefox Both repeats both widths and themes.
See the `*-layout-{1600,640}.json` geometry and corresponding PNGs.

Read-only text overrides Nextcloud's inherited opacity 0.5 with opacity 1 and the main text colour, while retaining the inactive background and read-only behaviour.
The browser contrast probe composites ancestor backgrounds and opacity before calculating WCAG relative luminance.
The not-set-up and sent scenes both measure the following draft text contrast.

| Theme | Text | Background | Opacity | Contrast |
| --- | --- | --- | --- | --- |
| Light | rgb(34,34,34) | rgb(237,237,237) | 1 | 13.59:1 |
| Dark | rgb(235,235,235) | rgb(41,41,41) | 1 | 12.20:1 |

Both exceed 4.5:1.
See `chromium/{not-set-up,sent}-{light,dark}-contrast.json` and the corresponding PNGs.

## Commands and reproducibility

Heavy commands use `HEAVY_MODE=none $GLOSS_WORK/../../tools/heavy-job.sh start $GLOSS_WORK/shots/final2 <job> -- <command>`, followed by the helper's `wait` command.
Verification uses `npm run check -- -- --maxWorkers=2` after deleting the generated bundle, and `scripts/php.sh test`.
The archive is built with `scripts/package.sh $GLOSS_WORK/archive/` from a clean detached checkout of the branch head.
`scripts/package.sh` changed to reject dirty runtime paths and package committed allowlisted files with deterministic archive metadata.
The instance is reset with `GLOSS_DEV_NC_FORCE_RESET=1 GLOSS_DEV_NC_COPY=1 scripts/dev-nc.sh reset`.
The archive is installed with `scripts/dev-nc.sh install-archive $GLOSS_WORK/archive/gloss-0.1.0.tar.gz`, followed by `scripts/dev-nc.sh debug false` and `scripts/dev-nc.sh archive-probe`.
Archive bundle and manifest bytes are checked with `tar -xOf <archive> gloss/js/gloss-review.js | sha256sum` and the corresponding manifest command.

Scene commands use `GLOSS_SHOTS_SKIP_SYNC=1 node scripts/shots.mjs <scene> --out <folder>`, adding `--browser firefox` for Firefox.
Current Chromium scenes are `editor pdf both not-set-up sent input-prompts unplaced password-lapse`, and Firefox runs `both`.
Scenes run sequentially, with the runner emptying the review folder before each theme.
Fixtures contain only synthetic garden text.
Historical checks not rerun in this round retain their evidence in `../final/`.
