# Release live check

The check uses the release archive on the disposable Nextcloud 33 instance at port 8090, with debug disabled.
The starting application commit is `9476fcd`, and all changes on this branch are tooling, tests, or notes.
Shots and job logs are in `/home/kiibou/.cache/gloss-work/rvw/work/shots/final/`.
Paths below are relative to that folder, and `{light,dark}` means both separately inspected images.

The installed `js/gloss-review.js` SHA-256 is `497324325e5bdd18e73da6c37352a5a150efef97c6058d7bc99c625499905eb9`.
The installed `appinfo/info.xml` SHA-256 is `bae65ef78c106990df8a59edf8bb984eece4e04885d49f326e1b27b6229031e8`.
Both match the archive bytes, and `occ app:list` reports enabled Gloss 0.1.0.
`npm run check -- -- --maxWorkers=2` passes all 59 test files and 982 tests.
The initial structure tests failed before implementation, and the final structure tests pass.

| Check | Scene assertions, light and dark | Shots and inspection |
| --- | --- | --- |
| H1, Chromium editor | Pass | `chromium/editor-{light,dark}.png` and `chromium/probed/editor-{light,dark}.png`: legible underlines and strikes, draft-order cards, and 3 changes, 1 comment, but lower cards are clipped behind the footer. |
| H2, Chromium PDF | Pass | `chromium/pdf-{light,dark}.png`, `chromium/probed/pdf-{light,dark}.png`, and `chromium/settled/pdf-{light,dark}.png`: text, stones mark, and Alpha plants comment form are legible, with a visible paper edge in light mode. |
| H2, Firefox PDF | Pass | `firefox/pdf-firefox-{light,dark}.png` and `firefox/settled/pdf-firefox-{light,dark}.png`: the same visible mark and selection form, with the light paper edge present. |
| H3, Chromium Both | Pass | `chromium/both-{light,dark}.png`, `chromium/probed/both-{light,dark}.png`, and `chromium/settled/both-{light,dark}.png`: three columns fit at 1600 by 1000, and the page has visible edges, but the panel overflows vertically. |
| H3, Firefox Both | Pass | `firefox/both-firefox-{light,dark}.png` and `firefox/settled/both-firefox-{light,dark}.png`: three legible columns and a complete paper edge, with the same panel overflow. |
| H4, Chromium search | Pass | `chromium/search-{light,dark}-matches.png`: readable highlighted matches and search controls; `chromium/search-{light,dark}.png`: visible go-to-line prompt without overlap. |
| H5, Chromium not set up | Pass | `chromium/not-set-up-{light,dark}.png` and `chromium/probed/not-set-up-{light,dark}.png`: correct warning and absent name and Send controls, but the read-only draft has poor contrast. |
| H6, Chromium waiting | Pass | `chromium/waiting-{light,dark}-retry.png`: correct retry sentence; `-versions.png`: one current version and no historical versions; final `.png`: Saved and one readable replacement card. |
| H7, Chromium review link | Pass | `chromium/review-link-{light,dark}-copy.png`: readable link and Copy fallback; `-reopened.png`: Ada and the saved edit in a fresh context; final `.png`: restored review fits without overlap. |
| H8, Chromium overall | Pass | `chromium/overall-{light,dark}.png`: synthetic text at the top of the panel, unchanged zero count, and Saving status at capture time. |
| H9, Chromium bell | Pass | `chromium/bell-{light,dark}-notification.png`: readable owner notification naming Ada and paper.typ; final `.png`: sent review with readable cards but faded editor text. |
| H10, Chromium sent | Pass | `chromium/sent-{light,dark}.png` and `chromium/probed/sent-{light,dark}.png`: correct thanks and absent card buttons, with poor contrast in the read-only editor. |
| Chromium input prompts | Pass | `chromium/input-prompts-{light,dark}-name.png`: correct refusal sentence and focused name; `-keyboard.png`: no comment form; `-pointer.png` and final `.png`: visible selection and comment form without overlap. |
| Chromium unplaced items | Pass | `chromium/unplaced-{light,dark}-saved.png`: saved stones comment; `-missing.png`: readable Could not place list after synthetic draft replacement; `-preserved.png` and final `.png`: list retained after a further save, with all 316 raw item bytes unchanged. |
| Chromium password lapse | Fail | `chromium/password-lapse-{light,dark}-direct.png`: clear Share not found page; `-password.png`: stock password prompt; `-saved.png`: Saved with one readable change; `-ended.png`: wrong link-gone sentence and faded editor; `-restored.png`: Saved with both recovered changes and readable cards, without overlap. |

There are 28 passing and two failing browser/theme results across the 15 scene/browser combinations.
The final password failure screenshots, `chromium/password-lapse-chromium-{light,dark}-failure.png`, duplicate the restored state because the scene completes the recovery probe before reporting its earlier assertion failure.
All listed shots, including both themes and the additional state shots, were inspected visually.
One review file remains in `Review reviews`, confirmed with `scripts/dev-nc.sh count-reviews` after the final run.
Both temporary password shares were deleted by the scenes, and the synthetic draft was restored after each unplaced-items run.

The extra `*-dark-settled.png` shots in both browsers' `settled/` folders are captured after another 1.5 seconds.
They show readable PDF text, a visible mark in PDF mode, and the delayed marks in Both mode.
Some image previews initially appeared blank, but full-resolution inspection and the PNG pixels confirm text is present.
The Chromium PDF text rectangle contains 9212 dark pixels in both light and dark shots, and Firefox contains 9466.
There is no confirmed blank-PDF failure and no missing light-mode paper edge.

The four `*-initial-tooling.png` shots retain the initial scene-development failures.
The input shots show keyboard selection with no visible comment form, and the unplaced shots show the retained warning and follow-up text.
The assertions were corrected to check visibility rather than DOM absence and to await the successful write rather than a status which deliberately retains the unplaced warning.
These are superseded by passing scene results.

## Findings for dispatch

An unauthenticated password-protected Gloss link returns HTTP 404 with Share not found instead of offering password entry.
The integration handles are `appinfo/routes.php:7` and `lib/Controller/ReviewController.php:60`.
See `chromium/password-lapse-{light,dark}-direct.png` and their `.probe.json` files, and the HTTP probe in `password-recovery.log`.
The same generated share opens its password prompt with HTTP 200 through Nextcloud's stock `/s/` route, after which Gloss loads successfully.
This workaround was used to complete the lapse and backup-recovery checks.
The OCS request used permissions 1, and Nextcloud reported 17, whose file-permission bits remain read-only at 1, as accepted by the coordinator.

Lapsing the password session shows the link-gone sentence instead of the session-ended sentence.
The classification handle is `src/app/failure.ts:5`, the displayed sentence is at `src/app/failure.ts:12`, and the resend follows token refresh in `src/adapters/http/review-api.ts:48`.
See `chromium/password-lapse-{light,dark}-ended.png`, their `.probe.json` files, `chromium/password-lapse-chromium-results.json`, and `password-recovery.log`.
Each theme records save replies 200, 412, and 404 before reauthentication, with the request count then stable for 6.5 seconds, so there is no retry loop.
Reauthentication restores both the first saved edit and the second backed-up edit, reaches Saved, and an owner WebDAV GET confirms both edits in the review file.
The final save receives HTTP 200, making four save requests in total per theme.

The review panel overflows and is clipped by Nextcloud's public-page container and footer.
The integration handle is `css/review.css:20`, with the grid at `css/review.css:6`.
See `chromium/probed/editor-light.png`, `chromium/probed/editor-dark.png`, and their `.probe.json` files, plus both browsers' Both shots.
The panel ends at y=1110.25, the fourth card starts at y=971.25, the footer starts at y=939, and the containing `app-gloss` element has `overflow: clip` and ends at y=992.

Read-only editor text inherits disabled-control fading from Nextcloud.
The integration handle is `src/adapters/codemirror/editor.ts:111`, with local editor styling at `css/review.css:17`.
See `chromium/probed/not-set-up-{light,dark}.png` and `chromium/probed/sent-{light,dark}.png`, with their `.probe.json` files.
The content has opacity 0.5, light text colour rgb(107,107,107) on rgb(237,237,237), and dark text colour rgb(153,153,153) on rgb(41,41,41), before opacity is applied.
The warning, sent sentence, and review cards remain readable.

## Commands and reproducibility

The instance was created with `GLOSS_DEV_NC_FORCE_RESET=1 GLOSS_DEV_NC_COPY=1 scripts/dev-nc.sh reset`.
The explicit foreign-checkout reset override was approved by the coordinator for this fixed disposable container only.
The release was installed with `scripts/dev-nc.sh install-archive /home/kiibou/.cache/gloss-work/rvw/work/archive/gloss-0.1.0.tar.gz`, followed by `scripts/dev-nc.sh debug false` and `scripts/dev-nc.sh archive-probe`.
Archive hashes were obtained with `tar -xOf <archive> gloss/js/gloss-review.js | sha256sum` and the corresponding manifest command.

Every heavy command used `HEAVY_MODE=none /home/kiibou/.cache/gloss-work/tools/heavy-job.sh start /home/kiibou/.cache/gloss-work/rvw/work/shots/final <job> -- <command>`, followed by the helper's `wait` command.
Dependency installation used `npm ci`, and verification used `npm run check -- -- --maxWorkers=2`.
Structure-test red and green jobs, full-check logs, initial scene logs, and diagnostic reruns remain beside the shot folders.
Scene commands used `GLOSS_SHOTS_SKIP_SYNC=1 node scripts/shots.mjs <scene> --out <folder>`, adding `--browser firefox` for Firefox.
Chromium scenes were `editor pdf both search not-set-up waiting review-link overall bell sent password-lapse input-prompts unplaced`, and Firefox scenes were `pdf both`.
Scene runs were sequential, with `empty-reviews` performed by the runner before each theme.
Diagnostic reruns used the `probed/` and `settled/` subfolders.
H6 made two save requests per theme, landed one write, and left one current version with zero historical versions in the owner's Versions tab.
