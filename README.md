# gloss for Nextcloud

A Nextcloud app for gloss, an editor for academic writing with an inline comment and review loop.
Reviewers use a share link to comment on raw source and propose changes, with the PDF beside it when available.
The author imports their reviews into gloss.

The architecture below describes the implementation.
Licence: AGPL-3.0-or-later.

## Architecture

The TypeScript application has four layers, with dependencies pointing inwards (R1 and R2).

| Location | Responsibility | Allowed imports |
| --- | --- | --- |
| `src/domain/` | Pure review model, diff, offsets, quote anchoring, saved formats, source parsing, and PDF matching | Domain only; no npm packages |
| `src/app/` | Ports, review session, and save queue | App and domain only |
| `src/adapters/` | CodeMirror, pdf.js, HTTP, browser storage, and browser services | App, domain, and npm packages; never UI |
| `src/ui/` | Preact header and side panel islands | App, domain, Preact, and signals; never adapters |
| `src/main.ts` | Construct and connect the ports, session, adapters, and islands | Wiring only; nothing imports it |

Cycles are forbidden.
The domain and app receive time, ids, and scheduling through parameters or ports and compile without the DOM.
Dependency-cruiser, knip, the pure TypeScript configuration, and purity tests enforce these rules.

`src/app/ports.ts` defines `EditorPort`, `PdfPort`, `ReviewApi`, `BackupStore`, `Clock`, `Ids`, `Scheduler`, `PanelPort`, and `Clipboard`.
`ReviewSession` owns a `DraftReview` per file, takes these ports, and exposes the commands the islands call.
The UI-owned `PanelModel` implements `PanelPort` with a signal per card and separate signals for order, count, and header state.
Only changed cards redraw; PDF marks update after 400 ms without typing, while the PDF is visible.
Preact owns `header.gr-head` and `aside.gr-side`; the editor and PDF adapters own `#gr-text` and `#gr-pdf`.

The build uses strict TypeScript and esbuild to produce the committed `js/gloss-review.js` IIFE, containing the application, CodeMirror, Preact, and pdf.js.
The same-origin `js/pdf.worker.js` is an ES module worker.
`css/pdf-text-layer.css` contains the text-layer rules extracted from pdf.js, alongside the application's `css/review.css`.
The page loads one application script and these two styles, without `window.Gloss*` globals or eval.

On the server, `Controller\ReviewController` handles HTTP, and `Service\DraftLocator` finds the draft and optional PDF.
`Service\ReviewKey` validates reviewer keys and derives file-name suffixes.
`Service\ReviewStore` handles the marker, review files, limits, revision checks, locking, and the sent transition.
`Service\SentNotifier` sends the notification once, and `Notification\Notifier` prepares it for the share owner; `AppInfo\Application` registers the notifier.
Services use OCP interfaces so PHPUnit can drive them with mocks.

The draft is the first top-level `.typ`, `.tex`, `.md`, or `.txt` file by name, with the PDF of the same base name or the sole PDF in the folder.
The shared folder must contain a `.gloss-review` marker, empty or a JSON object up to 4 KiB, to enable reviewing.
A read-only share is enough: reviews are written with the owner's rights into `<shared folder name> reviews` beside the shared folder, created on the first save.
For example, `Review/` has its reviews in `Review reviews/`, with files named `<slug>-<key hash>.json`.
Reviewers see the draft, PDF, and their own review.
Without the marker, the page stays read-only and says "This link is not set up for reviewing."

[`schema/review-1.schema.json`](schema/review-1.schema.json) is the format 1 contract with gloss's import, including `revision` and offsets in UTF-16 code units.
The spike's files inside the shared folder's `reviews/` are abandoned and are read by neither the app nor the import.
See [the decisions](docs/decisions.md) for the save protocol, key handling, and password-link behaviour.

## Building and checking

Use `npm ci` to install the locked dependencies, then `npm run build` after source changes.
Commit the generated application bundle, worker, and text-layer stylesheet with their source changes.
Run `npm run typecheck`, `npm run structure`, and `npm test -- --maxWorkers=2`, or `npm run check` for the combined build and checks.
Vitest uses Node for domain and app tests and jsdom for adapters and UI.
Run PHP checks through `scripts/php.sh test` and `scripts/php.sh lint`, using Docker rather than a local PHP installation.
The full contributor commands and hard rules are in [CLAUDE.md](CLAUDE.md).

## Trying it locally

Use `scripts/dev-nc.sh up` for a disposable Nextcloud 33 at `http://127.0.0.1:8090`, with this repository mounted read-only as the app.
The script owns container `gloss-dev-nc`, generates synthetic fixtures and test credentials, and keeps those credentials in the gitignored `.dev-nc.env` without printing them.
Never read that file into a session or print it.
Open a generated share's review page at `/apps/gloss/r/<share token>`.
Password-protected shares first require authentication on `/s/<share token>` in the same browser.
Use `scripts/dev-nc.sh reset` to restart the disposable instance after route changes, and `scripts/dev-nc.sh down` when finished.
The script enables Nextcloud debug mode so route changes are picked up promptly without an app version bump.
Use `node scripts/shots.mjs <scene>` for hand-check pictures in light and dark themes under the gitignored `shots/` directory, and inspect both.
For PDF and side-by-side scenes, also check Firefox and WebKit with `--browser firefox` and `--browser webkit`.
The development and screenshot scripts use this disposable setup for hand checks.
The scene runner empties only files in its `Review reviews` folder before each light and dark run through `scripts/dev-nc.sh empty-reviews`, using WebDAV at `127.0.0.1:8090`.
The cleanup action requires Python 3 for its standard XML parser.
