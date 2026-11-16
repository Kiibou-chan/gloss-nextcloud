# Review decisions

The author ruled on the review design on 2026-11-15.
The quoted words below come from the brief or the recorded answer; the numbered R-rulings supply the implementation decisions and rationale.
The implementation plan is [2026-11-15-step0-and-features.md](plans/2026-11-15-step0-and-features.md).
These decisions describe the implemented review page.

## RVW-1: a Nextcloud app

The author's answer was C: "a Nextcloud app".
The review page lives in Nextcloud so reviewers can use its share links and the author can collect reviews in their own files.
The server uses Nextcloud's OCP interfaces, with HTTP separated from file handling (R13).

## RVW-2: source and PDF views

The author's answer was "A and B ideally": source view and PDF view.
The author said "proposed changes I would like to have in the editor" and "There would be a switch between pdf and editor or both."
The editor supports proposals and comments, and the PDF provides the rendered draft beside its source, with selections mapped back to source words (R8 and R36).
The Editor, PDF, and Both choices are kept per link, and the switch is hidden when there is no PDF.

## RVW-3: reviews beside a read-only share

The author's answer was B: "the app writes each review with the share owner's rights into a folder next to the shared one".
The link can remain read-only, with `Review/` producing `Review reviews/` in the owner's files, created on the first save (R16).
Reviewers see only the draft, PDF, and their own review.
A top-level `.gloss-review` file in the shared folder enables reviewing; it must be empty or a JSON object no larger than 4 KiB.
This marker records the owner's consent to writes beside that folder, so an ordinary share without it stays read-only and refuses review open and save requests.
Share permissions are not checked beyond a valid token; the spike's create-permission check goes because saving uses the owner's rights (R17).

## RAW-1: raw source with the PDF beside it

On raw Typst instead of a readable view, the author said reviewers "are fine with that and otherwise will still have the pdf".
The decision is raw source with the PDF beside it.
CodeMirror edits the source, while the PDF provides its rendered appearance; the old readable rendering is removed and the pure parsing needed for matching is retained (R35).

## TS-1: strict TypeScript and esbuild

The brief calls for "TypeScript strict, ES modules, one esbuild bundle".
R3 chooses TypeScript 6.0.3 with `strict` and `noUncheckedIndexedAccess`, and esbuild 0.28.2 for bundling.
Both TypeScript configurations must pass `tsc --noEmit`, including the domain and app configuration without the DOM.
The application IIFE is `js/gloss-review.js`, the ES module worker is `js/pdf.worker.js`, and extracted pdf.js text-layer styles are `css/pdf-text-layer.css`.
This keeps the existing esbuild build path while checking interfaces and layer boundaries before bundling, with no `window.Gloss*` globals.

## TEST-1: Vitest

The brief asks for "Unit tests with Vitest or Node's test runner (pick one, say why)" and "test-first for everything new".
R4 chooses Vitest 5.0.1, with Node for domain and app tests and jsdom 30.1.1 for adapters and UI.
Vitest runs TypeScript without a separate compilation step, supports per-file environments, and follows gloss's existing runner and related-test workflow.
The test script fixes no worker count; the caller chooses one.

## FORMAT-1: the contract with gloss's import

The brief specifies "a reader per format so later formats keep reading old reviews".
R10, R11, and R33 fix format 1 in `schema/review-1.schema.json` as the contract with gloss's import, which is built against it on Wednesday morning, 2026-11-18.
The contract includes the integer `revision` field, starting at 1 on disk, which makes a retried save identifiable.
A review holds its reviewer name, draft file and etag, sent state and times, and items with unique ids.
Anchored items carry `file`, `from`, and a quote with `exact`, `prefix`, and `suffix`; proposals carry replacement words, comments carry text and times, and at most one overall item carries the overall comment.
`from` counts UTF-16 code units, as JavaScript does, so importers must not interpret it as a byte or Unicode code-point offset.
The quote context is at most 32 characters on each side, and derived `shown` and `proposalShown` fields are omitted to keep reviews small (P4).
The `file` field preserves the seam for later multi-file drafts.
The reader dispatches by format, treats an absent format as format 0, gives format 0 items fresh format 1 ids, sets their revision to 0, and writes only the newest format.
A higher format is refused with "This review was saved by a newer gloss."
The spike's reviews in the shared folder's `reviews/` are abandoned: the app does not open them, and gloss's import does not read them.
The format 0 reader remains available for explicitly supplied old records; it does not search that folder.
This is acceptable because the spike was never released and the first release replaces its editable-share storage model.
The import validates every file against the schema, while the server checks the bounded fields it needs (R12 and R19).

## PLACE-1: marker and owner-side storage

RVW-3 B places reviews "into a folder next to the shared one".
R16 locates the shared folder through `IRootFolder::getUserFolder($share->getShareOwner())->getFirstNodeById($share->getNodeId())`, then uses its parent for `<shared folder name> reviews`.
An existing file blocking that folder name gives `reviewsBlocked`; the marker is required for both open and save.
R17 removes the upload/create permission requirement so a read-only link can support reviewing.
The explicit owner-side lookup is testable with mocked OCP interfaces and follows Nextcloud's owner-side node resolution (P6).

## KEY-1: browser-generated keys

The brief allows that the "file name may keep a slug of the first name".
R18 chooses a 16-character `[A-Za-z0-9]` key generated by browser Web Crypto with rejection sampling behind the `Ids` port.
The server accepts only that shape and stores `<slug>-<h>.json`, where `h` is the first 16 hex digits of the key's SHA-256 hash.
The slug is the first word of the name, lower-cased to `[a-z0-9-]`, limited to 24 characters, with `reviewer` as its fallback.
Lookup uses the hash suffix with `hash_equals`, and a later name change keeps the file name.
A browser-generated key lets a lost first-save answer be retried against the same review, while hashing keeps write keys out of synced directory listings.
R20 opens a review by POST, keeping the key out of request URLs and access logs; a well-formed unknown key returns `{ review: null }` without throttling.
The key is not part of the review JSON.

## SAVE-1: revision saves and harmless retries

The brief asks for browser changes to be "restored if newer than the server copy".
R22 measures this by revision because clocks on two devices need not agree.
The page sends `baseRevision` as the last revision known to have landed and `revision` as one more, with 0 and 1 respectively for a first save.
The server holds an exclusive named lock from reading through writing, refuses stale saves as conflicts, and returns success without rewriting when the incoming revision and bytes exactly match the stored review.
That retry rule also applies to a landed Send, so a lost answer does not create another file, report a false conflict, or send a second notification (R21).
There is at most one save in flight; retryable failures resend the same bytes before newer edits are saved.
R23 saves 5 s after the last change, immediately on Send and `pagehide`, and retries after 2, 5, and 15 s, then every 15 s, or immediately when the browser comes online.
Non-retryable 400, 403, 404, 409, 410, and 413 responses stop retries and keep the browser backup.
A 429 stops retries within the current page.
A 412 refreshes the request token once.
The browser backs up 300 ms after the last change and immediately on leaving, preserving the pending body and known revision.
A dirty backup is restored when its revision matches the server's or its pending save carries the server's revision, with that pending body resent first.
Otherwise it is kept separately and offered through "Show the changes from this browser" as read-only text for copying.
A full browser store adds "Not backed up in this browser."
A `pagehide` save uses `keepalive` below 64 KiB and leaves larger bodies to the backup.
The delay limits file versions and desktop sync traffic, while the backup protects work between saves (P4 and R23).

## RVWPW-1: the share page handles passwords

The author's answer on 2026-11-15 at 20:04 was A.
R32 records no password prompt of the review page's own.
A password-protected link must first be authenticated on its `/s/<token>` page in the same browser; otherwise Nextcloud answers 404 (P6).
The review page keeps the spike's behaviour, and R23 treats that 404 as a link that no longer works rather than retrying indefinitely.
This uses Nextcloud's existing share authentication; a separate review-page password prompt is left for a later release.

## PDFP-1: reviewers see their proposals drawn on the PDF

The author's answer on 2026-11-16 at 10:34 was B ("Okay sure").
Her expectation was that reviewers could see directly in the PDF the changes they propose.
The PDF stays the uploaded file, unchanged.
Each proposal is drawn on it: deleted words are struck through in place, and inserted words appear in a small mark at that spot.
This works for Typst and LaTeX alike, because it builds on the existing PDF-to-source match.
It fits the Wednesday 2026-11-18 release, where compiling in the browser would not.
Turned down for now: option A, compiling the edited source in the browser (Typst WebAssembly), which is left for a later release.
