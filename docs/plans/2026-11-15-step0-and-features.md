# gloss for Nextcloud, step 0 and the review features: implementation plan

> **For agentic workers:** build task by task, test-first; steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the spike's review page rebuilt in layers (a pure domain, an application layer with ports, adapters, a Preact panel, and wiring), in strict TypeScript with structure checks, PHPUnit, and CI, with no behaviour lost; then the review features: read-only links with reviews written beside the shared folder (RVW-3 B), saving that survives a bad network, a review link that opens the review on any device, an overall comment, and a notification on Send.
**Status:** revised from plan review 1 (`/home/kiibou/.cache/gloss-work/rvw/plan-review-1.md`, at `c8d1077`); each finding's change is in "Review 1 findings" at the end.
**Request:** the brief `/home/kiibou/.cache/gloss-work/rvw/brief-plan.md`, with your rulings of 2026-11-15 as it quotes them: RVW-1 = C, RVW-2 = "A and B ideally", raw source with the PDF beside it, RVW-3 = B, "at least in the long run" multi-file drafts, good coding practice and clean architecture, and "Sounds good" to step 0 and the feature list.
**Base:** branch `spike-review` at `baf4dad`; every handle below holds there unless it names another repository.
**Plan branch:** `plan-step0`, from the base; it changes only this plan.
**Deadline:** reviewers from Wednesday 2026-11-18; gloss's import of reviews on Wednesday morning reads format 1 (task S2 freezes it first); you sign and release on the App Store on Wednesday afternoon, and no task touches a signing key.
**Build:** tonight on the laptop (not MewTwo), in a Sonnet task session that drives Codex through `codex-task.sh`, one Codex run per task, in the clone `~/.cache/gloss-work/rvw/build`; hand checks on `scripts/dev-nc.sh` at port 8090; test-first, each new test seen red before its code; lanes, parallel tasks, and the Tuesday checkpoint are in "Order and lanes".
**Review:** the plan review and its one recheck; the build's first review from the correctness angle; security reviews stay on hold (CR-244), so the security points the plan review raised are parked in "Parked security points" at the end.

## What exists today

The app is one controller, one template, four page scripts, one CodeMirror bundle, and one stylesheet (1,153 lines, `wc -l`).
`ReviewController` (`lib/Controller/ReviewController.php`) is a `PublicShareController` for a public link to a folder: `page` (`:63-85`), `text` (`:88-95`), `pdf` (`:98-106`), `load` (`:110-124`), and `save` (`:127-151`), with the draft found at `:173-178`, the PDF at `:181-191`, and the reviewer key checked at `:194-196`.
`save` refuses a link without the create permission (`:129`) and writes `reviews/<key>.json` inside the shared folder (`:136-150`); the folder is `$share->getNode()` (`:164-170`), which Nextcloud resolves in the share owner's own files (P6), so that permission check is the only guard on the write.
The page loads six scripts (`:64-69`): pdf.js 3.11.174 (`js/vendor/pdf.min.js`, worker `js/vendor/pdf.worker.min.js`), `js/typst-view.js` (`window.GlossTypst`), `js/pdf-view.js` (`window.GlossPdf`), `js/diff.js` (`window.GlossDiff`), `js/vendor/editor.bundle.js` built from `src/editor.mjs` (`window.GlossEditor`, `src/editor.mjs:124`), and `js/review.js`, one closure of 311 lines holding the state, the mapping, the views, the form, the saving, and the start.
`package.json` has one script, the esbuild of the editor; there is no TypeScript, no test, no PHP test, and no CI.

### The behaviours that must survive

Each is a line of acceptance test A0 and of hand check H1 to H4; a ruling below that changes one says so.

- B1. The draft is the first `.typ`, `.tex`, `.md`, or `.txt` file at the shared folder's top level, by name (`ReviewController.php:173-178`); the PDF is the PDF of the same base name, or else the only PDF there (`:181-191`).
- B2. The editor is CodeMirror 6 on the raw source with line numbers, the active line, history, bracket matching, search and replace at the top, go to line (`searchKeymap`), selection matches, line wrapping, and spell check in the draft's language (`src/editor.mjs:81-86`), with Typst and LaTeX colouring (`:14-50`).
- B3. The spell language is Typst's `#set text(lang: "..")` or LaTeX's babel option, mapped to `en` or `de` (`js/review.js:303-304`).
- B4. Proposals are the word diff of the draft and the editor's text (`js/review.js:193-206`, `js/diff.js:45-67`), changes one whitespace token apart joined (`js/diff.js:57`); new words are underlined and old words struck through as widgets (`js/review.js:81-95`, `src/editor.mjs:52-60`).
- B5. A proposal keeps its id and comments while it overlaps its earlier self (`js/review.js:197-201`); one that disappears keeps its comments as a comment on its old words (`:203`).
- B6. A selection in the editor opens the form unfocused, for the proposal it touches or for its own words (`js/review.js:187-190`, `:212-219`).
- B7. A selection in the PDF is placed in the source by its letters and digits, the match nearest its page winning (`js/pdf-view.js:30-37`), opens the form focused, and scrolls the editor there (`js/review.js:220-228`); a failure says "That selection could not be placed in the draft. Select a little more, or use the editor." (`:225`).
- B8. An item takes several comments; a comment can be deleted; deleting a comment item's last comment removes the item (`js/review.js:117-129`).
- B9. A proposal's card has Undo change, which restores the old words as an undoable edit (`js/review.js:135-143`).
- B10. A card's click scrolls the editor to it and the PDF to its mark (`js/review.js:146-149`).
- B11. Cards are in draft order, under the count line "N changes, M comments" (`js/review.js:152-158`); R40 fixes the spike's plural for one, a spike bug and not a lost behaviour.
- B12. The views Editor, PDF, and Both, the choice kept per link in the browser, the switch hidden without a PDF (`js/review.js:231-242`, `templates/review.php:7-11`); the PDF loads on first showing (`js/review.js:236-239`) and carries a mark over each item's words (`:96-100`, `js/pdf-view.js:71-101`).
- B13. Editing needs a name and an unsent review (`js/review.js:94`, `:163`); Send marks the review sent, makes the editor read-only, and says "Review sent. Thank you." (`:157`, `:292-295`).
- B14. On loading, saved items are placed by their quotes and the number that no longer match is said (`js/review.js:269-285`).
- B15. The header shows the draft's name and the page's title is "Review: <name>" (`ReviewController.php:83`, `templates/review.php:6`).

## Probes

On this laptop, Node 26.10.0, on synthetic text only; the scripts are kept in `/home/kiibou/.cache/gloss-work/rvw/`.

- **P1, the diff on every change does not scale.** `diffprobe.mjs` runs the spike's `GlossDiff.changes` on a 10,000-line draft of seeded Greek-letter words (572,902 characters, 200,971 tokens) against the same draft with k one-word insertions spread through it.

  | Edits (k) | Time per change | Memory added |
  | --- | --- | --- |
  | 1 | 81 ms | 90 MB |
  | 10 | 80 ms | 85 MB |
  | 100 | 313 ms | 616 MB |
  | 300 | 902 ms | 1,288 MB |
  | 1,000 | 3,435 ms | 6,443 MB |

  The memory is the trace: every step of Myers' loop copies the whole diagonal array of 2(n + m) + 3 entries (`js/diff.js:17`, `:21`), so memory grows as (n + m) times the number of edits, and the time with it; extrapolated by the same growth, 2,000 items would need about 13 GB a keystroke.
- **P2, the offset mapping is quadratic.** `toApplied` sorts every proposal on each call (`js/review.js:53-63`) and the editor's redraw calls it per item (`:84-91`); with 2,000 proposals the mapping alone took 50 ms per redraw.
- **P3, the pure parts are fast enough once.** `parseprobe.mjs` on a 10,000-line Typst draft: `GlossTypst.parse` 18 ms (10,260 ops), `GlossPdf.sourceKey` 85 ms (a key of 462,211 characters), and 2,000 placements by `toSource` 324 ms; the spike redraws every PDF mark on every change (`js/review.js:96-100`, `:159`).
- **P4, 2,000 items fit in 1 MiB, barely.** 2,000 seeded items, each with a four-word quote, 32 characters of context on each side, a four-word proposal, and one 14-word comment: 927,640 bytes (0.88 MiB) in the spike's shape and 815,402 bytes (0.78 MiB) in format 1, which drops the derived `shown` and `proposalShown`.
- **P5, pdf.js from npm.** `npm view pdfjs-dist` gives 6.5.438 (Apache-2.0); in its `build/pdf.mjs`, `build/pdf.worker.mjs`, and `build/pdf.renderer.mjs`, `isEvalSupported` occurs 0 times and `new Function(` and `eval(` 0 times (the one `new Function` text is `new FunctionBasedShading`), and 5.7.284 is the same, while the vendored 3.11.174 has the option once in each file.
  esbuild 0.28 bundles `import { getDocument, GlobalWorkerOptions, TextLayer } from 'pdfjs-dist'` as an IIFE of 435.1 kB and `build/pdf.worker.mjs` as an ES module of 1.2 MB, neither holding `new Function(` or `eval(`.
  pdf.js 6 starts its worker as `new Worker(src, { type: "module" })` (`build/pdf.mjs:17094-17096`) and wraps only a cross-origin `src` in a blob import (`:7196-7204`); `renderTextLayer` is gone for the `TextLayer` class (`types/src/display/text_layer.d.ts:35`); rendering in a second worker needs `GlobalWorkerOptions.rendererSrc` and otherwise runs on the main thread (`types/src/display/worker_options.d.ts:15-22`); the text layer's CSS is in `web/pdf_viewer.css` (168,800 bytes with 46 `url(` references), its `.textLayer` blocks at `:648` and `:3592` onwards.
- **P6, Nextcloud 33's interfaces.** In the container `gloss-nc` (`nextcloud:33-apache`, 33.0.11, PHP 8.4.27): `Share::getNode()` resolves the node in the share owner's user folder (`lib/private/Share20/Share.php:157-172`); `PublicShareMiddleware` answers 404 to an unauthenticated password link of a `PublicShareController` (`lib/private/AppFramework/Middleware/PublicShare/PublicShareMiddleware.php:68-79`) and throttles a bad token (`:122`); `IRegistrationContext::registerNotifierService` (`lib/public/AppFramework/Bootstrap/IRegistrationContext.php:253`), `INotifier::prepare` (`lib/public/Notification/INotifier.php:50`), `IRootFolder::getUserFolder` (`lib/public/Files/IRootFolder.php:32`), `Folder::getFirstNodeById` (`lib/public/Files/Folder.php:176`), `ISecureRandom`, and the attributes `BruteForceProtection` and `AnonRateLimit` exist; `occ` has no command that creates a share.
  Your server has `notifications` and `files_sharing` enabled (gloss, `docs/design/review-by-others.md:20`).
- **P7, PHP test dependencies.** Packagist: `nextcloud/ocp` `dev-stable33` requires PHP `~8.2 || ~8.3 || ~8.4 || ~8.5`; `phpunit/phpunit` 11.5.58 requires PHP `>=8.2`.
- **P8, what gloss already has.** gloss's quote anchoring, `refind`, `quoteAt`, `nearest`, and `contextGuess` with `Quote = { exact, prefix, suffix }` and 32 characters of context (gloss `src/platform/text/logic/text.ts:97-198` at `8fc93e7eb`), is pure and is what the spike's `locate` (`js/review.js:42-50`) approximates.
  gloss's word diff is an O(n·m) table capped at 4,000 tokens (gloss `src/features/threads/logic/token-diff.ts:6`, `:24-30`), built for one proposal's words, so it cannot diff a 200,971-token draft.
  gloss pins TypeScript 6.0.3, Vitest 5.0.1, jsdom 30.1.1, dependency-cruiser 18.6.0, knip 6.41.0, esbuild 0.28.2, Playwright 1.63.0, Preact 10.29.8, and `@preact/signals` 2.11.4 (gloss `package.json:50-79`), and its list-and-card views are Preact islands (gloss `CLAUDE.md`, Islands).

## Size limits and the edit path

The brief's limits: a 10,000-line draft, 50 reviewers, and 2,000 items in one review.

| Work | Spike | After this plan | Ruling |
| --- | --- | --- | --- |
| Proposals after a keystroke | whole-draft diff, 81 ms to 3.4 s, memory (n + m) times edits (P1) | diff of each change's region only, at most 2,000 edits and 16 MB a region, coarser above that | R6 |
| Draft offset to editor offset | sort per call, O(P² log P) per redraw (P2) | prefix sums, O(log P) per call, O(P) per edit | R7 |
| Editor text per keystroke | `doc.toString()` of the whole draft (`src/editor.mjs:89`) | the changed ranges and their new text | R6 |
| Cards per keystroke | all rebuilt (`js/review.js:152-158`) | keyed, only changed cards redrawn | R8 |
| PDF marks per keystroke | all placed again (P3: 324 ms at 2,000) | after 400 ms without typing, while the PDF shows, changed items only | R8 |
| Readable text of an item (`shown`) | filter of every op per item (`js/review.js:38-39`) | binary search over the ops | R8 |
| Placing saved items on load | `indexOf` over the draft per item (`js/review.js:42-50`) | gloss's `refind`, near the saved offset first | R9 |
| Saved review | 0.88 MiB at 2,000 items (P4) | 0.78 MiB; over 1 MiB is refused with a message | R10, R19 |
| Backup in the browser | none | written 300 ms after the last change, and on leaving | R22 |
| Review files per link | unbounded | 50 | R19 |
| PDF pages drawn | every page's canvas kept, 900 by 1,273 px at 4 bytes a pixel, 4.6 MB a page at pixel ratio 1 and 18.3 MB at 2 (`js/pdf-view.js:43-52`) | pages near the view drawn, canvases far from it released; text for matching from `getTextContent`, no drawing needed | R36 |

The edit path is the only superlinear work found; R6 and R7 make a keystroke cost the changed lines plus O(P), and task S4b's timed test holds it there.

## Design rulings

### Architecture and tooling

(R1) Ruling: four layers under `src/` and a wiring file: `src/domain/` (pure: the review model, the diff, offsets, quotes, the saved format, the Typst parse, and the PDF text matching), `src/app/` (the ports the adapters and the panel implement, the review session, and the save queue), `src/adapters/` (CodeMirror, pdf.js, the server API, and browser storage), `src/ui/` (the side panel in Preact), and `src/main.ts` (wiring only); why: the brief puts each adapter "behind an interface the domain or app layer defines", and the session and the save queue are neither pure model nor drawing, so they get the application layer that clean architecture puts between them; cost if wrong: one folder more than the brief names.

(R2) Ruling: dependency-cruiser enforces, with severity error: `domain` imports nothing outside `domain` and no npm package; `app` imports only `domain` and `app`; `adapters` imports `app`, `domain`, and npm packages, never `ui`; `ui` imports `app`, `domain`, `preact`, and `@preact/signals`, never `adapters`; nothing imports `main.ts`; no cycles; in addition `domain` and `app` compile under a second `tsconfig.pure.json` with `lib: ["ES2023"]` and no DOM, and `test/structure/purity.test.ts` fails on `Date`, `Math.random`, `crypto`, `setTimeout`, `localStorage`, `window`, or `document` in their source; why: the brief's layer rule and "time and ids are parameters", and gloss's rule that logic takes the time as a parameter (gloss `CLAUDE.md`, Structure checks); a type error is the earliest place to catch a DOM use; cost if wrong: a `tsconfig` and a grep test to keep.

(R3) Ruling: TypeScript 6.0.3 with `strict` and `noUncheckedIndexedAccess`, as gloss (`tsconfig.json:6-7` there), checked by `tsc --noEmit` over both configs; esbuild 0.28.2 strips the types and makes `js/gloss-review.js` (IIFE: the app, CodeMirror, Preact, and pdf.js), `js/pdf.worker.js` (ES module, from `pdfjs-dist/build/pdf.worker.mjs`), and `css/pdf-text-layer.css` (the `.textLayer` blocks cut from `pdfjs-dist/web/pdf_viewer.css` by `scripts/text-layer-css.mjs`); the page loads one script (`Util::addScript('gloss', 'gloss-review')`) and two styles; no `window.Gloss*` global remains; why: the brief's "one esbuild bundle", P5's bundle probe, and a module worker that must be same-origin JavaScript (P5), which a `.js` file is on every web server where `.mjs` needs a MIME rule; the CSS cut avoids 168,800 bytes and 46 image references for some 60 lines, and a fresh build in CI catches it drifting from pdf.js; cost if wrong: one more build script.

(R4) Ruling: Vitest 5.0.1 runs the unit tests, in Node for `domain` and `app` and in jsdom 30.1.1 for `adapters` and `ui`; the `test` script fixes no worker count, and callers pass one (`--maxWorkers=8` on the laptop, Vitest's default in CI); why: it is gloss's runner, so its habits and `vitest related` carry over; it runs TypeScript without a compile step; and it gives each file its environment, which Node's test runner does only with a hand-made jsdom setup; cost if wrong: one dev dependency tree more than Node's runner.

(R5) Ruling: pdf.js is `pdfjs-dist` 6.5.438 from npm, pinned, bundled by R3; the vendored `js/vendor/pdf.min.js`, `js/vendor/pdf.worker.min.js`, and `js/vendor/pdfjs-LICENSE` go, and the licence texts of every bundled package are gathered by `scripts/third-party.mjs` from their own files in `node_modules` into the committed `THIRD-PARTY.md` (R31, task R1); `isEvalSupported` is not passed, since 6.5.438 has neither the option nor any `eval` path (P5), and `test/structure/no-eval.test.ts` fails if a built bundle holds `new Function(` or `eval(`; pages render on the main thread as with 3.11.174 (no `rendererSrc`); the text layer uses the `TextLayer` class; no `wasmUrl` is set; why: the brief's item 4, P5, and a test that keeps "no eval" true across Dependabot's upgrades where an option would silently stop existing; cost if wrong: a PDF with JPEG 2000 images draws them with pdf.js's slower fallback decoder, and long PDFs draw on the main thread as they do now.

(R6) Ruling: proposals are kept up to date by diffing only the changed regions, built in two steps behind one `DraftReview.edit`: task S4a diffs the whole draft against the editor text with common prefix and suffix tokens trimmed and a band-only trace, and task S4b replaces that by the region diff, the same tests passing; the editor adapter reports each transaction as replacements in the old text's coordinates (CodeMirror's `iterChanges`, R43), with no `doc.toString()`; the domain widens each change on its own to whole lines of the editor text, then to every proposal that touches it, then on each side until at least one unchanged word lies between it and the next proposal outside, and merges only regions that touch or overlap, so a replace-all of a common word makes as many small regions as it has occurrences; per region it maps the ends to the draft (exact, as they lie outside proposals), diffs that draft stretch against the region's new text, and splices the result in place of the proposals inside; the diff keeps only the 2d + 1 diagonals each step needs and stops at D = 2,000 edits whatever the region's size, so a region's trace holds at most 2,001² entries, 16 MB as `Int32Array`; a region that reaches the cap is diffed again by lines (each line one token, the same cap), and each changed run of lines becomes one replacement proposal; a region whose line diff also reaches the cap becomes one replacement proposal; the invariant, tested over random edit sequences, is that applying the proposals to the draft gives the editor's text exactly; why: P1 measured the whole-draft diff at 81 ms for one edit and 3.4 s and 6.4 GB at 1,000, while a keystroke changes one line; the cap on D alone bounds a pasted section of some 12,000 tokens, which a cap on region size let through at about 576 MB (plan review 1, I7, arithmetic); and widening per change keeps a replace-all from merging the draft into one proposal that quotes all 572,902 characters and cannot be saved (R19); a replace-all of 3,000 one-word occurrences beside 200 earlier proposals writes 832,713 bytes (0.79 MiB, a seeded `node -e` probe of format 1's shape), so it stays saveable; S4a first puts the step 0 path on the simpler diff and S4b's risk beside it (I8); cost if wrong: a change next to a region's edge can be split into two proposals where the whole-draft diff would have joined them, and a pasted section over 2,000 word edits is proposed by lines, both of which the invariant tolerates and hand check H1 would show.

(R7) Ruling: `AppliedMap` keeps the proposals sorted by draft offset with prefix sums of their length changes, answers `toApplied` and `fromApplied` by binary search, and is rebuilt once per edit in O(P); why: P2's 50 ms per redraw at 2,000 proposals came from a sort per call (`js/review.js:53-63`); cost if wrong: none, the answers are the spike's.

(R8) Ruling: the side panel is a Preact island on `@preact/signals` (Preact 10.29.8, signals 2.11.4, as gloss): one keyed `Card` per item reading its own signal, so a keystroke redraws only the cards of changed items and the count line; the editor and the PDF stay hand-built adapters; PDF marks are placed 400 ms after the last change, only while the PDF shows, and only for items whose words changed since the last placing; `shown` finds its ops by binary search; why: gloss's islands rule for list-and-card views (gloss `CLAUDE.md`, Islands, lodge s-xtvz8g) is the part that already does keyed lists, P3's 324 ms for every mark on every change, and the spike's full rebuild (`js/review.js:152-158`); cost if wrong: Preact and signals in the bundle, 20.5 kB minified with a one-button island (esbuild probe, P5's setup).

(R9) Ruling: saved items are placed by gloss's `refind` with its helpers (`nearest`, `contextGuess`, `quoteAt`; gloss `src/platform/text/logic/text.ts:97-198` at `8fc93e7eb`), ported into `src/domain/text/quote.ts` with its constants (32 characters of context, 5,000 for nearness) and the cases of gloss's tests for them, and a comment naming the source file and commit; an item `refind` marks detached counts as no longer matching, as B14 says; two differences from gloss, each named in the port's comment: an empty quote (an insertion) whose `prefix + suffix` is not found counts as lost where gloss's `refind` keeps it at the clamped offset (gloss `text.ts:150-155`), as the spike's `locate` does (`js/review.js:42-50`, `:278`); and `placeItems` places proposals in saved order and counts as lost any proposal whose placed range overlaps one already placed, its comments kept as a comment item on its words as B5 does, so the proposals `AppliedMap` and R6's invariant work on are disjoint; why: it is the part that does this job (lodge d-7779qs), it prefers the occurrence nearest the saved offset where the spike takes the first (`js/review.js:45-49`), and the same `Quote` type (gloss `text.ts:198`) means the import maps a review's quotes onto gloss anchors with no conversion; it is ported, not imported, because gloss is an Electron app with no package to depend on; cost if wrong: two copies to keep alike, which the shared test cases make visible; a proposal that loses an overlap is shown as a comment and not as a change.

### The saved format

(R10) Ruling: reviews are saved as format 1, with `schema/review-1.schema.json` (JSON Schema 2020-12) beside it:

| Field | Type | Meaning |
| --- | --- | --- |
| `format` | `1` | the format |
| `revision` | integer, at least 1 | the save's number: one more than the revision it was saved over, 1 for a new file (R22) |
| `name` | string, 1 to 100 characters | the reviewer's name as typed |
| `draft` | `{ file, etag }` | the main file's path in the shared folder and its etag when last saved |
| `sent` | boolean | Send was pressed |
| `sentAt` | ISO time or `null` | when |
| `updatedAt` | ISO time | the last change, by the reviewer's clock |
| `items` | array of items | below |

| Item field | Kinds | Meaning |
| --- | --- | --- |
| `id` | all | 10 characters `[a-z0-9]`, unique in the review |
| `kind` | all | `proposal`, `comment`, or `overall` |
| `file` | `proposal`, `comment` | the file's path in the shared folder, `/`-separated (one file today) |
| `from` | `proposal`, `comment` | the quote's start in that file when last saved, in UTF-16 code units, as JavaScript counts |
| `quote` | `proposal`, `comment` | `{ exact, prefix, suffix }`, prefix and suffix up to 32 characters each |
| `proposal` | `proposal` | the new words replacing `quote.exact` |
| `comments` | `proposal`, `comment` | `[{ text, at }]`; a `comment` item has at least one |
| `text` | `overall` | the overall comment |
| `at` | all | when the item was made, or for `overall` last changed |

The reviewer key is not in the file (R18); the derived `shown` and `proposalShown` of the spike are dropped; at most one `overall` item; the schema's descriptions say what each field counts, `from` in UTF-16 code units among them; why: the brief's item 6 and the `file` field of its feature 6, the import's need for gloss's own `Quote` shape (R9), P4's size at 2,000 items, `revision` as the token that makes a retried save harmless (R22, plan review 1, C1), named now because the import reads format 1 on Wednesday morning (R33), and a reader in another language that counts code points or bytes would shift every offset after a character outside the Basic Multilingual Plane (M4); cost if wrong: a field the import misses means format 2, which R11 makes cheap.

(R11) Ruling: `readReview(json: unknown): { review, notes } | { error }` dispatches on `format`: absent is format 0 (the spike's files), `1` is format 1, a higher number is refused with "This review was saved by a newer gloss."; format 0 maps `name`, `sent`, and `draft` (a file name, into `draft.file` with an empty etag), each item's `kind`, `from`, `quote`, `comments`, `at`, and `proposal`, gives each item a new id of format 1's shape (the spike's ids are up to 8 characters, `js/review.js:28`) through the `newId` function it is passed, sets `file` to the draft's name, drops `reviewer`, `shown`, and `proposalShown`, gives `updatedAt` the latest `at`, and sets `revision` to 0, so the first save writes 1; the server never reads the spike's `reviews/` folder inside a shared folder, so the spike's reviews are abandoned by the app, and `docs/decisions.md` says so (S15); the writer writes only the newest format; each reader is its own module, `format-0.ts` and `format-1.ts`; why: the brief's item 6; new ids because a format 0 review read and saved again would otherwise fail the schema and be refused by the import (plan review 1, M3); abandoning the spike's reviews because the spike was never released (Wednesday's App Store release is the first, R30) and wrote only into shared folders with editable links, which RVW-3 B replaces; cost if wrong: a review made on a spike link before Wednesday is not opened by the new page, and you read its JSON by hand.

(R12) Ruling: the schema is checked in Vitest with ajv 8.20.0 (dev only) against the writer's output and against `test/fixtures/review-1-*.json`; the server checks only what it needs (R19) and stores the bytes it was sent; the import in gloss validates every file against the schema, since the files come from anyone holding the link; why: a full validator on the server is a runtime dependency on the attack surface, and the import is where a file's content is trusted or not; cost if wrong: a malformed file reaches your reviews folder, where the import refuses it by name.

### The server

(R13) Ruling: PHP in five classes: `Controller\ReviewController` (HTTP only: parameters in, a service call, results and exceptions to responses), `Service\DraftLocator` (the draft's files and its PDF from the shared folder), `Service\ReviewStore` (the reviews folder, the marker, the key's file, the limits, the revision check under its lock (R22), and the sent transition), `Service\ReviewKey` (a value object: shape, hash, file-name suffix), and `Notification\Notifier` with `Service\SentNotifier` for feature 5; `AppInfo\Application` registers the notifier; the services take OCP interfaces (`IRootFolder`, `IShare`, `ILockingProvider`, `INotificationManager`, `IURLGenerator`, `IFactory`) and the time as `ITimeFactory`; why: the brief's item 5, and services that a unit test drives with mocks; cost if wrong: none.

(R14) Ruling: PHPUnit 11 with `nextcloud/ocp` `dev-stable33` as dev dependencies in `composer.json`, tests in `tests/Unit/`, run in CI by `shivammathur/setup-php` on PHP 8.2 and 8.4 and locally by `scripts/php.sh`, which runs `composer` and `phpunit` in the official `composer:2` image with the repository mounted (no PHP on the laptop); `php -l` over `lib/`, `appinfo/`, and `templates/`; why: P7 (PHPUnit 11 runs on Nextcloud 33's lowest PHP, 12 would not), and PHP 8.4 is what the container runs (P6); cost if wrong: the first `scripts/php.sh` run pulls an image.

(R15) Ruling: the draft endpoint becomes `GET /r/{token}/draft`, answering `{ main, files: [{ file, text, etag }] }` with one file today, and `DraftLocator::locate(Folder): ?Draft` returns `Draft { main: File, files: list<File>, pdf: ?File }`; why: the multi-file seam (feature 6) costs one array now and no API change later; cost if wrong: none.

(R16) Ruling: reviews live in a folder beside the shared one in the owner's files, named `<shared folder's name> reviews`, found as `IRootFolder::getUserFolder($share->getShareOwner())->getFirstNodeById($share->getNodeId())->getParent()` and made on the first save; one may be saved or opened only when the shared folder holds a file `.gloss-review` at its top level, which you put there, up to 4 KiB, empty or a JSON object (unknown keys ignored, `main` read by the later multi-file plan); without it the page says "This link is not set up for reviewing." and stays read-only, and the open and save endpoints answer 403 `{ error: 'notReviewable' }`; a reviews name that exists as a file answers 409 `{ error: 'reviewsBlocked' }`; why: RVW-3 B ("the app writes each review with the share owner's rights into a folder next to the shared one"), the marker as your consent so that no read-only link to another folder can write into your files, and an explicit lookup a test can mock where `getNode()` does the same lookup out of sight (P6); cost if wrong: a shared folder at the top of your files has its reviews folder at the top too.

(R17) Ruling: the share's permissions are not checked beyond a valid token; the spike's create-permission check (`ReviewController.php:129`) goes; why: RVW-3 B makes the link read-only, the marker is the guard, and a reviewer with an editable link could change the draft through Files anyway, which is your choice of link and not the app's; cost if wrong: none.

(R18) Ruling: the reviewer key is 16 characters from `[A-Za-z0-9]`, made in the browser by `crypto.getRandomValues` with rejection sampling (about 95 bits), behind the `Ids` port; the server accepts only `^[A-Za-z0-9]{16}$`; the review's file is `<slug>-<h>.json`, where `h` is the first 16 hex digits of the key's SHA-256 and `slug` the first word of the name lower-cased to `[a-z0-9-]`, up to 24 characters, `reviewer` when empty; the file is found by its `-<h>.json` suffix with `hash_equals`, and a later change of name keeps the file name; why: a key made in the browser lets the first save be retried without making a second file when its answer is lost (feature 2), the brief's "file name may keep a slug of the first name", and a hash in the name keeps a listing of your reviews folder, which syncs to your laptop, from holding the keys that write to it; cost if wrong: a key from a broken random source can be guessed, which Web Crypto rules out in every browser Nextcloud 33 supports.

(R19) Ruling: limits: the `review` parameter at most 1,048,576 bytes (413 `tooLarge`), at most 50 review files matching `*-<16 hex>.json` in the reviews folder before a new one is made (409 `full`), a name of 1 to 100 characters, and `json_decode` with depth 16; the server checks `format` is 1, `name` a string, `sent` a boolean, and `items` an array, else 400 `badReview`; the page checks the size before sending and says "Your review is over 1 MB and cannot be saved; shorten some comments.", and for `full` says "This link has reached its limit of 50 reviews. Please write to the person who sent you the link."; a race between two first saves can pass 50 by the number racing; why: the brief's limits, P4 (2,000 items fit), and bounds that hold however many people hold the link; the `full` sentence names a way on, since one reviewer who clears the browser after a first save leaves a file and starts a second (plan review 1, M14); cost if wrong: a review with 2,000 long comments cannot be saved whole.

(R20) Ruling: endpoints after feature 1:

| Route | Verb | Parameters | Answer |
| --- | --- | --- | --- |
| `/r/{token}` | GET | | the page, with `data-reviewable` |
| `/r/{token}/draft` | GET | | `{ main, files }` (R15) |
| `/r/{token}/pdf` | GET | | the PDF |
| `/r/{token}/review/open` | POST | `key` | `{ review, revision }`, or `{ review: null }` for a well-formed key with no file; 400 for a malformed key; 403 |
| `/r/{token}/review` | POST | `key`, `review`, `baseRevision` | `{ revision }`, or 400, 403, 409, 413, 423 |

Opening is a POST so that a key never stands in a URL or an access log; neither action carries `BruteForceProtection` or registers a throttle attempt, and an unknown well-formed key is an ordinary answer and not an error; no `AnonRateLimit`, since 50 reviewers behind one university address saving every few seconds would trip any per-address limit low enough to matter; the old `GET /review` and `/text` routes go; why: keys in fragments and bodies only, and the bounds of R19 instead of a rate; opening a key that has no file yet is a normal path (a reload before the first save, a file you moved), and Nextcloud's throttle is per address and action (`PublicShareMiddleware.php:40` in `gloss-nc`, `Throttler.php:145-160`, at most 10 attempts in 30 minutes, `IThrottler.php:42`), so a throttled `open` would lock out every reviewer on one network after about ten such reloads (plan review 1, I2), while a key of about 95 bits (R18) needs no throttle to stay unguessable; the throttle's removal is parked as a security point (CR-244); cost if wrong: one link holder can rewrite their own file often, inside 1 MiB, and can try keys at the server's request rate, against 2^95.

(R21) Ruling: a review stored as sent is final: a save over it answers 409 `sent`, except the idempotent retry of R22, which answers success; the save that changes `sent` from false to true sends the notification once (feature 5), and a retry of that save sends none; why: the notification tells you a finished review is there, the page already stops editing after Send (`js/review.js:94`), and a Send whose answer was lost must not show an error for a review that was sent (plan review 1, C1); cost if wrong: a reviewer who wants to add something after Send starts a new review.

(R22) Ruling: a save is checked by format 1's `revision` (R10): the page sends the review with `revision` one more than the last revision it knows to have landed, and `baseRevision` that last revision (0 for none); the server, holding Nextcloud's lock `gloss-review/<share token>/<h>` (`ILockingProvider::acquireLock` with `LOCK_EXCLUSIVE`, as `apps/files_trashbin/lib/BackgroundJob/ExpireTrash.php:123` uses a named lock) from its read to its write, answers by the first row that fits:

| Stored file | Incoming | Answer |
| --- | --- | --- |
| lock held by another request | any | 423 `busy`, retried |
| none | `baseRevision` 0 and `revision` 1 | written, `{ revision: 1 }` |
| `revision` equal to `baseRevision`, not sent | `revision` = `baseRevision` + 1 | written, `{ revision }` |
| `revision` equal to the incoming `revision`, bytes equal to the incoming bytes | any | not written, `{ revision }`, the retry of a save that landed |
| sent, any other case | | 409 `sent` |
| any other case | | 409 `conflict` with the stored `revision` |

The page keeps at most one save in flight; a save that fails without an answer, or with a retryable one, is retried with the same bytes, and changes made meanwhile are saved after it lands; so a lost answer to a first save, a later save, or a Send ends, at the retry, in the third row and leaves one file; the 409 `conflict` page says "Your review was changed in another window or on another device. Reload the page to continue."
The browser keeps, per link and key, `{ review, pending, revision, saved, dirty, at }` in `localStorage` under `gloss-review:<share token>:<key>`, where `pending` is the body of the save in flight or waiting for its retry, `revision` the last revision known to have landed, and `saved` true from the first save that landed; it is written 300 ms after the last change and at once on `pagehide`; on opening, the page calls `open` only for a key with `saved` true or a key from the link's fragment (R24), and otherwise starts from the backup; a dirty backup whose `revision` equals the server's, or whose `pending` carries the server's `revision`, is restored, its `pending` resent first; a dirty backup that matches neither is kept under `...:conflict` and the server's copy shown with "Changes made in this browser at <time> were not restored, as the review changed elsewhere." and a button "Show the changes from this browser", which opens the kept items as read-only text (each quote, its proposal, and its comments) to copy from; a clean backup is dropped; a full storage skips the backup and the status adds "Not backed up in this browser."; why: the brief's "restored if newer than the server copy", measured by revision since two devices' clocks need not agree; an etag alone turns a lost answer into a conflict, since the retry carries the etag from before the save that landed, and the lost edits then sit under a key nothing reads (plan review 1, C1, M5); a client-made counter is the field the import can read where an etag is the server's; the lock keeps two tabs saving in the same instant from both passing the check and the loser later overwriting the winner; a synchronous write on leaving, which IndexedDB cannot promise; cost if wrong: a reviewer working in two tabs at once is asked to reload in one, and copies their kept changes from the text box.

(R23) Ruling: the save queue sets a dirty flag on every change, saves 5 s after the last change, at once on Send and on `pagehide`, retries a save that failed without an answer or with a retryable one after 2, 5, and 15 s and then every 15 s while dirty, and at once on the browser's `online` event; 400, 403, 404, 409, 410, 413, and 429 are not retried, and each leaves the backup in place; 404 and 410 say "This review link no longer works. Your changes are kept in this browser.", 429 says "The server is refusing saves for now. Your changes are kept in this browser; reload the page later to try again.", and the page stops editing on 404, 410, and 403; the status otherwise reads "Saved", "Saving…", "Not saved yet; trying again in N s", or "Not saved: <reason>"; a `pagehide` save uses `fetch` with `keepalive` when its body is under 64 KiB, the browsers' limit for such requests, and otherwise leaves the review to the backup; while dirty, leaving the page asks the browser's own question (`beforeunload`); Send sets `sent`, stops editing, shows "Sending…", and flushes the queue: on success it says "Review sent. Thank you.", on a refusal it clears `sent`, allows editing again, and shows the refusal's sentence, and on a retryable failure it says "Not sent yet; trying again in N s" and keeps retrying; the queue is in `src/app/` and takes a `Scheduler` port, so its tests run on a fake clock; why: the brief's feature 2; a deleted or expired link answers 404 from Nextcloud's own middleware, which registers a throttle attempt for the address each time (`PublicShareMiddleware.php:55-59`), so retrying it every 15 s would lock out everyone on the reviewer's network within minutes while telling the reviewer nothing (plan review 1, I1); 5 s rather than the spike's 600 ms (`js/review.js:267`) because each save is a new file version in your storage and a change your desktop client syncs, 0.8 MiB a save at 2,000 items (P4), while the backup at 300 ms covers a closed tab (M11, to be checked on the Versions tab after H6); Send's states as the spike has them on success and refusal (`js/review.js:292-295`) and a waiting state for a bad network (M6); cost if wrong: "Saved" shows some seconds later, and a 429 caused by something else stops saving until a reload.

(R24) Ruling: after the first successful save the panel shows "Your review link" with the page's address plus `#<key>`, a Copy button that writes it through the `Clipboard` port (R42), and "Open it on any device to continue your review."; a page opened with a fragment of the key's shape opens that review and remembers the key for the link, replacing a remembered one; the fragment stays in the address bar; the name field is filled from the file; why: the brief's feature 3, and a fragment is never sent to the server; cost if wrong: the key stays in the browser's history, which is where a bookmark of it would be anyway.

(R25) Ruling: the overall comment is a text box headed "Overall comment" at the top of the panel, saved as the one `overall` item as you type (through R23), its `at` the last change; it is not in the count line; Send is enabled when the review has an item or a non-empty overall comment; why: the brief's feature 4; cost if wrong: none.

(R26) Ruling: Send's notification goes to the share owner through `INotificationManager`, app `gloss`, object `review` with the review file's id, subject `review_sent` with the name, the draft's name, and the file's id and path; the notifier renders "{reviewer} sent a review of {draft}" as a rich subject, `reviewer` a `highlight` and `draft` a `file`, links it to the review file through the `files.viewcontroller.showFile` route, and puts the strings through `IL10N` for app `gloss`; why: the brief's feature 5, and rich parameters are escaped by Nextcloud's client where a plain subject would carry a stranger's text as it stands; cost if wrong: none.

### Pages, checks, and release

(R27) Ruling: the page's content security policy stays as the spike set it (`worker-src 'self'`, `font-src data:`, `ReviewController.php:78-81`), with no `unsafe-eval` and no `wasm-unsafe-eval`; why: P5's same-origin module worker and R5; cost if wrong: none.

(R28) Ruling: hand checks run on a disposable Nextcloud from `scripts/dev-nc.sh` and are photographed by `scripts/shots.mjs <scene>`, Playwright 1.63.0's headless Chromium in a fresh context (no cached scripts), once with `colorScheme: 'light'` and once with `'dark'`, into the gitignored `shots/`; H2 and H3 run also in Playwright's Firefox and WebKit (`--browser firefox|webkit`); `dev-nc.sh up` sets `debug => true` in the disposable instance's `config.php`, so Nextcloud keeps routes 3 s and not 3,600 s (`lib/private/Route/CachingRouter.php:36`, `:77-87` in `gloss-nc`), and a task that adds a route sees it at its next hand check; each UI task names its scenes, and the builder looks at both pictures before calling the task done; why: gloss's rule that an interface change is done when its screenshot is looked at, light and dark, and headless so nothing opens on a desktop; reviewers use Firefox and Safari, and pdf.js 6 sets a newer browser floor than 3.11.174 (plan review 1, M13); without debug a running instance answers a new route with 404 for up to an hour, since the route cache's prefix changes only with an app version (`lib/private/Memcache/Factory.php:113-135`) and R30 keeps the version (I9); cost if wrong: browser downloads of some hundreds of MB once per machine, and a debug instance that is slower than production.

(R29) Ruling: the built files (`js/gloss-review.js`, `js/pdf.worker.js`, `css/pdf-text-layer.css`) stay committed, and CI rebuilds them from a clean `npm ci` and fails on `git diff --exit-code`; why: the app must run when the repository is mounted as it is (`scripts/dev-nc.sh`) and the release archive takes them as they are, as the spike does (README, Building); cost if wrong: large diffs on dependency upgrades.

(R30) Ruling: no task changes `<version>` in `appinfo/info.xml`; task R1 sets 0.1.0 for the first release; why: version bumps on parallel branches conflict, and the fresh browser context of R28 needs no cache-busting; cost if wrong: none.

(R31) Ruling: `scripts/package.sh` builds `build/gloss-<version>.tar.gz` with a top folder `gloss/` from an allowlist (`appinfo/`, `lib/`, `templates/`, `css/`, `js/gloss-review.js`, `js/pdf.worker.js`, `LICENSE`, `README.md`, and `THIRD-PARTY.md` with the licence texts of pdf.js (Apache-2.0), CodeMirror and Lezer, and Preact and its signals, as R5 gathers them), signs nothing, and its test fails if the archive holds `.local-nc.env`, `.dev-nc.env`, any `.env*`, `node_modules/`, `src/`, `tests/`, `test/`, `.git`, or `shots/`, so an edit to the allowlist cannot let the generated passwords of S14 through (plan review 1, M9); why: you sign and release on Wednesday afternoon from an archive, and a hand-made archive of this folder would carry the test credentials file; cost if wrong: none.

(R32) Ruling: password-protected links stay as the spike has them, and the page gets no password prompt of its own: the page opens only after the reviewer has entered the password on the link's own `/s/<token>` page in the same browser, and otherwise answers 404 (P6), which R23 treats as a link that no longer works; why: your answer RVWPW-1 = A (2026-11-15 20:04); a link's token is 15 random characters from a 52-character alphabet by default (Nextcloud `lib/private/Share/Constants.php:18`, `lib/private/Share20/Manager.php:1986-1989`), so without a password only those you send it to can open it; cost if wrong: a password-protected link needs that detour, and an own prompt (`AuthPublicShareController`) is one lane P session in a later release.

(R33) Ruling: task S2 freezes format 1 first and pushes the schema and three fixtures (`review-1-small.json`, `review-1-overall.json`, `review-1-sent.json`), and `docs/decisions.md` names the schema as the contract with gloss's import; why: the import is built on Wednesday morning against the format, in parallel with this plan's other tasks; cost if wrong: an import built against a format that then changes.

(R34) Ruling: ids are 10 characters `[a-z0-9]` from `crypto.getRandomValues` behind the `Ids` port, and times are ISO strings from the `Clock` port; the domain receives an id as a function of type `NewId = () => string`, declared in `src/domain/review/model.ts`, which `Ids.item` satisfies and S4a's `edit` and R11's format 0 reader take, and a time as a string value; why: the brief's "time and ids are parameters", the spike's `Math.random` ids (`js/review.js:28`), and one name for the shape in S4a, S7's fakes, and the reader, since the domain may not import the app's port (R2, plan review 1, M14); cost if wrong: none.

(R35) Ruling: `js/typst-view.js`'s `render` and `sourceOffset` (`:160-216`) are deleted and `parse` (`:41-140`) moves to `src/domain/source/typst-parse.ts` with `dropBlankParagraphs`; `js/diff.js`, `js/pdf-view.js`, `js/review.js`, and `src/editor.mjs` go once their parts are moved; why: the brief's item 12, and nothing calls `render` or `sourceOffset` (`git grep -n "render(\|sourceOffset" js/review.js` prints nothing); cost if wrong: none.

(R36) Ruling: the PDF view lays out every page at its size at once, draws a page's canvas and text layer when it comes within one screen of the view (`IntersectionObserver`), and releases canvases more than ten pages away; PDF matching runs on the strings of `page.getTextContent()` for all pages, read once and kept, through the pure `pdfKey(pages)` of `src/domain/pdf/match.ts`, and a mark is drawn when its page's text layer exists, over `TextLayer.textDivs`, which pairs with `textContentItemsStr` (`types/src/display/text_layer.d.ts:80`, `:86`); why: the spike keeps every page's canvas (`js/pdf-view.js:43-58`), which the arithmetic in the size table puts at hundreds of megabytes for a long draft, and matching on strings makes the PDF side as testable as the source side; cost if wrong: a mark on a page not yet drawn appears when it is scrolled to.

(R37) Ruling: the template keeps the root `#gloss-review` with its `data-*` and four empty slots as today's template has them (`header.gr-head`, `article#gr-text`, `article#gr-pdf`, and `aside.gr-side`, `templates/review.php:5`, `:17-19`); Preact islands render the header's content into `header.gr-head` and the panel into `aside.gr-side`, and the editor and PDF adapters draw into `#gr-text` and `#gr-pdf`; why: gloss's islands rule that hand-built code writes only into slots no island owns (gloss `CLAUDE.md`, Islands, item 2), and `css/review.css` keeps its selectors; cost if wrong: none.

(R38) Ruling: task S12 keeps the spike's `GET /text`, `GET /review`, and `POST /review` working beside the new `GET /draft`, so the page works after every merge; tasks F1a and F1b are merged together, since F1a removes the old routes and F1b moves the page to the new ones; why: no merge leaves a broken page on the branch you test from; cost if wrong: none.

(R39) Ruling: a checkpoint on Tuesday 2026-11-17 at 20:00: by then S1, S2, S3, S4a, S5, S6, S7, S8, S9, S10, S11a, S11b, S12, S14, S15, and F1a are merged into the build's target branch; if any is not, S4b, S9's canvas releasing (its own last commit), S13, H11, and the Firefox and WebKit runs of R28 wait for the next release, and features are cut at once from the end in this order: F4 first, then F5, then F3, then F2; F1a, F1b, and R1 are never cut, and nothing falls back onto the spike's structure; if F1b has not merged by Wednesday 2026-11-18 at 12:00, the session tells the coordinator, since the release then waits for it; why: the step 0 path is nine build sessions one after another before F1b, so a slip there leaves no Wednesday release unless something on that path can wait (plan review 1, I8); without S4b a keystroke costs what the spike's diff costs in time (P1) with the band trace's memory, which a review of a few hundred changes bears; without F1 saving needs an editable link writing into the shared folder, which RVW-3 B rules out, a lost review (F2) costs a reviewer more than a missing link (F3) or notification (F5), and the overall comment (F4) can be a comment on the title meanwhile; cost if wrong: a feature you valued more waits a few days, or a draft with thousands of changes is slow to edit until S4b lands.

(R40) Ruling: the count line takes the singular for one ("1 change", "1 comment") where the spike writes "1 changes, 1 comments" (`js/review.js:156`); this fixes a spike bug and is not one of the behaviours B1 to B15 that must survive unchanged; why: British English on the page; cost if wrong: none.

(R41) Ruling: the spike's outputs that S3, S4a, and S6 compare against are recorded once as committed golden JSON under `test/fixtures/spike/` (`diff.json`, `applied.json`, `shown.json`, `typst.json`, `pdf.json`), each case holding its seeded input and the spike's answer, by `scripts/spike-golden.mjs`, written in S1, which loads `js/diff.js`, `js/typst-view.js`, and `js/pdf-view.js` in a `node:vm` context with a bare `window`, and cuts the closure locals `shown`, `toApplied`, and `fromApplied` out of `js/review.js` (`:38-39`, `:53-74`) by their declarations into the same context; the tests read only the JSON, and S11b deletes the script with the spike's files; why: those three are locals of an IIFE that needs `#gloss-review` in the DOM (`js/review.js:1-3`), so no test can reach them, and tests that load the spike's files would fail when S11b deletes them (plan review 1, I5); cost if wrong: a seeded case set fixed at S1, which a task can widen by rerunning the script before S11b.

(R42) Ruling: the panel's seam is a ui-owned `PanelModel` (`src/ui/panel-model.ts`, task S11a): one signal per card, a signal of the ordered ids, one for the count line, and one for the head's view, made by `createPanelModel()` before the session and passed to it as the app's `PanelPort`, whose calls are fine-grained: `upsertCard(view: CardView)`, `removeCard(id)`, `setOrder(ids)`, `setCount(count: { changes; comments })`, and `setHead(view: HeadView)`, with `setStatus`, `setLink`, `setOverall`, and `showConflict` added by F2, F3, and F4; `main.ts` builds the model, then the session with it, then calls `mountHead(el, model, session)` and `mountPanel(el, model, session)`, each returning `dispose()`; S7's fake `PanelPort` records the same calls; a `Clipboard { write(text: string): Promise<boolean> }` port joins S7's list for F3's Copy; why: as first written the session needed the panel's ports and the islands needed the session, so `main.ts` had no order to build them in, and a whole `PanelView` per keystroke would make the island diff 2,000 cards, which gloss's islands rule forbids (gloss `CLAUDE.md`, Islands, item 4; plan review 1, I6, M8); cost if wrong: none.

(R43) Ruling: the CodeMirror adapter reports each transaction's changes synchronously in an update listener, one `onEdit` call per transaction, in the coordinates of the text before that transaction; once per save the session compares the domain's applied text with `EditorPort.text()` (one `doc.toString()`, O(n)) and, on a difference, rebuilds the domain from the editor's text by R6's diff of the whole draft and logs it; why: the spike defers its report by `queueMicrotask` (`src/editor.mjs:87-91`), and two transactions in one tick reported together would put the second's offsets in the first's result, after which the applied text drifts from the editor's with no `doc.toString()` left on the keystroke path to repair it (plan review 1, M7); cost if wrong: one O(n) comparison per save.

## Layers and interfaces

```
src/
  domain/                 pure; no DOM, no clock, no randomness, no npm package
    text/diff.ts          word diff (R6)
    text/quote.ts         Quote, quoteAt, refind (R9)
    review/model.ts       Proposal, Note, Overall, Comment, Change, Target, NewId (R34)
    review/applied-map.ts AppliedMap (R7)
    review/draft-review.ts DraftReview: one file's proposals and notes against its draft
    review/region.ts      the changed region of R6
    format/record.ts      ReviewRecord, the in-memory form of format 1
    format/format-0.ts, format-1.ts, read.ts, write.ts (R10, R11)
    source/typst-parse.ts, shown.ts, language.ts
    pdf/match.ts          keyOf, sourceKey, pdfKey, toSource, placeMarks
  app/                    ports and use cases; may import domain only
    ports.ts              EditorPort, PdfPort, ReviewApi, BackupStore, Clock, Ids, Scheduler, PanelPort, Clipboard
    session.ts            ReviewSession
    view.ts               HeadView, CardView (plain data)
    save-queue.ts         (feature 2)
  adapters/
    codemirror/editor.ts, typst-language.ts, highlight.ts
    pdfjs/pdf-view.ts, worker-entry.ts
    http/review-api.ts
    storage/browser-store.ts
    browser/clock.ts, ids.ts, scheduler.ts, clipboard.ts
  ui/
    panel-model.ts        PanelModel, the signals behind PanelPort (R42)
    head.tsx, panel.tsx, card.tsx, comment-form.tsx, mount.ts (+ review-link.tsx, overall.tsx in features)
  main.ts                 wiring only
schema/review-1.schema.json
```

The ports, as task S7 writes them (names binding, details the builder's):

```ts
type Change = { from: number; to: number; insert: string };            // in the editor text before the change
interface EditorPort {
  setText(text: string): void;                                        // outside history; no onEdit
  text(): string;                                                     // once per save (R43)
  replace(change: Change): void;                                      // as if typed: undoable; onEdit follows
  setMarks(marks: readonly EditorMark[], deleted: readonly DeletedWords[]): void;
  setEditable(on: boolean): void;
  scrollTo(pos: number): void;
  onEdit(listener: (changes: readonly Change[]) => void): void;       // once per transaction, synchronously (R43)
  onSelect(listener: (range: { from: number; to: number }) => void): void;
}
interface PdfPort {
  show(): Promise<{ pages: readonly (readonly string[])[] }>;          // loads once; text items per page
  setMarks(placements: readonly PdfPlacement[]): void;
  scrollToMark(id: string): void;
  onSelect(listener: (s: { text: string; fraction: number }) => void): void;
}
interface ReviewApi {
  draft(): Promise<{ main: string; files: readonly { file: string; text: string; etag: string }[] }>;
  open(key: string): Promise<{ review: unknown; revision: number } | { review: null } | Failure>;
  save(key: string, body: string, baseRevision: number): Promise<{ revision: number } | Failure>;
}
type Failure = { status: number; error: string } | { status: 0; error: 'network' }; // 0: no answer
type Backup = { review: string; pending: { body: string; revision: number } | null; revision: number; saved: boolean; dirty: boolean; at: string };
interface BackupStore {
  rememberedKey(): string | null; remember(key: string): void;
  read(key: string): Backup | null; write(key: string, b: Backup): boolean;
  keepConflict(key: string, b: Backup): void; readConflict(key: string): Backup | null;
  view(): ViewMode | null; setView(v: ViewMode): void;
}
interface Clock { now(): string }                                      // ISO time
interface Ids { item(): string; key(): string }
interface Scheduler { after(ms: number, run: () => void): () => void } // returns cancel
interface PanelPort {                                                 // implemented by the ui's PanelModel (R42)
  upsertCard(view: CardView): void; removeCard(id: string): void; setOrder(ids: readonly string[]): void;
  setCount(count: { changes: number; comments: number }): void; setHead(view: HeadView): void;
}
interface Clipboard { write(text: string): Promise<boolean> }
```

`ReviewSession` holds one `DraftReview` per file (one today), takes the ports in its constructor, calls `PanelPort` only for what changed (a card per changed item, the order when it changes, the count), and offers the commands the islands call (`setName`, `setView`, `commentOn`, `deleteComment`, `undoProposal`, `focusItem`, `send`, and in the features `setOverall`, `copyLink`, and `showConflict`); it never touches the DOM.

## The multi-file seam (feature 6, not built)

What this plan builds now: the `file` field on every anchored item (R10), `Draft { main, files, pdf }` from `DraftLocator` and `{ main, files }` from `/draft` (R15), `ReviewSession` keyed by file, the marker read as a JSON object whose `main` key is reserved (R16), and `placeMarks` and `toSource` taking a source key that records `[file, offset]` per character (one file today).
What the later plan adds: `DraftLocator` reads `main` from `.gloss-review`, follows Typst `#include "<path>"` and LaTeX `\input{<path>}` and `\include{<path>}` within the shared folder (no path outside it, no cycles, a depth cap), and returns the files in include order; the page shows one editor tab per file; the source key concatenates the files in include order so a PDF selection lands in its file; the save carries every file's items in one review.
Nothing in format 1 changes for it: `file` already names the file, and `draft.file` names the main file.

## Acceptance tests

- **A0, the behaviours survive.** Each of B1 to B15 has a test in the task that moves it (named in the task), and hand checks H1 to H4 walk them on the page after S11b.
- **A1, the layers hold.** `npm run structure` fails on a domain file importing an adapter, on a `ui` file importing an adapter, on an import of `main.ts`, and on an unused export; `test/structure/purity.test.ts` fails on `Date` in `src/domain/`; each seen red on a throwaway file in S1; spike-oracle tests read only `test/fixtures/spike/` (R41).
- **A2, the format.** Every fixture and the writer's output validate against `schema/review-1.schema.json`; a format 0 fixture reads into the format 1 record, and that record written validates; format 2 is refused; 2,000 items of P4's shape stay under 1 MiB.
- **A3, the edit path.** Over 500 seeded random edit sequences on synthetic text, applying the proposals to the draft gives the editor's text; the same holds for sequences starting from placed (loaded) proposal sets; one keystroke on a 10,000-line draft with 2,000 proposals stays under the bound S4b sets from its measurement; a replace-all of a word with 3,000 occurrences keeps every other proposal's id and writes under 1 MiB; a region past 2,000 edits falls back to lines (R6).
- **A4, the server.** PHPUnit: R16 to R22's cases, among them a lost answer to a first save, to a later save, and to Send, each retried to success with one file and one notification (task F1a), R26's notification (task F5), and B1's draft and PDF choice (task S12).
- **A5, the bundles.** A fresh build equals the committed files; neither bundle holds `new Function(` or `eval(`.
- **A6, the release archive.** It holds the allowlist and none of the forbidden paths (R31).

## Tasks

Commands: `npx vitest run <files> --maxWorkers=8` for the tests a task names, `npm run typecheck`, `npm run structure`, `npm run build`, and `scripts/php.sh test`; the full `npm test`, the typecheck, and the build go through the lock the build dispatch names (`flock -w 3600 <lock> <command>`).
Every task ends with the typecheck, `npm run structure`, and the tests it names passing, and commits with explicit paths.
A task marked UI ends with its hand checks (see "Hand checks"), light and dark, looked at.

### Task S1: tooling, the layer rules, and the spike's golden outputs (lane T, first)

**Files:** `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.pure.json`, `vitest.config.ts`, `.dependency-cruiser.cjs`, `knip.json`, `scripts/build.mjs`, `scripts/spike-golden.mjs`, `test/fixtures/spike/{diff,applied,shown,typst,pdf}.json`, `test/structure/purity.test.ts`, `.gitignore` (`shots/`, `build/`, `.dev-nc.env`, `/vendor/`, the last anchored so `js/vendor/` stays tracked).
**Interfaces:** scripts `build` (`node scripts/build.mjs`, today's editor bundle only), `typecheck` (`tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.pure.json`), `test` (`vitest run`, no worker count; R4), `structure` (`depcruise src test --config .dependency-cruiser.cjs && knip`), `check` (all four); every dependency the plan pins is added here, so no later task edits `package.json`'s dependencies or the lock: dev dependencies at gloss's versions (P8), ajv 8.20.0, `@playwright/test` 1.63.0, and `pdfjs-dist` 6.5.438, `preact` 10.29.8, and `@preact/signals` 2.11.4; `tsconfig.json` has `"jsx": "react-jsx"` and `"jsxImportSource": "preact"`; `knip.json` lists each package in `ignoreDependencies` with the task that removes it from the list (ajv S2, `pdfjs-dist` S9, Preact and signals S11a, Playwright S14), so knip passes before they are used (plan review 1, M2).

- [ ] Write `purity.test.ts` (R2's names in `src/domain/` and `src/app/`), add a throwaway `src/domain/probe.ts` holding `Date.now()`; run `npx vitest run test/structure/purity.test.ts --maxWorkers=8`; expect FAIL naming the file.
- [ ] Write R2's rules; add a throwaway `src/domain/a.ts` importing a throwaway `src/adapters/b.ts`; run `npm run structure`; expect FAIL on the rule `domain-pure`; then a throwaway `src/ui/c.ts` importing the adapter; expect FAIL on `ui-no-adapters`.
- [ ] Delete the throwaways; run the purity test and `npm run structure`; expect PASS.
- [ ] Write `scripts/spike-golden.mjs` (R41) with seeded inputs: ten pairs for `GlossDiff.changes`, 200 proposal sets with probe offsets for `toApplied` and `fromApplied`, 200 ranges for `shown`, ten synthetic Typst sources for `GlossTypst.parse`, and the four PDF cases of S6 for `GlossPdf`; run it; check that `git check-ignore -v js/vendor/editor.bundle.js` prints nothing; commit the JSON.
- [ ] Run `npm run build`; expect `js/vendor/editor.bundle.js` byte-equal to the committed one (`git diff --exit-code`).
- [ ] Commit.

### Task S2: format 1, its schema, and its readers (lane T, after S1; parallel with S3, S5, S6, S12, S14, S15)

**Files:** `src/domain/format/{record.ts,format-0.ts,format-1.ts,read.ts,write.ts}`, `schema/review-1.schema.json`, `test/fixtures/review-1-{small,overall,sent}.json`, `test/fixtures/review-0-spike.json` (synthetic words, in the spike's shape), `test/domain/format/{read,write,schema}.test.ts`, `knip.json` (ajv out of `ignoreDependencies`).
**Interfaces:** `type ReviewRecord` (format 1 without `format`, with `revision`), `readReview(json: unknown, newId: NewId): { record: ReviewRecord; notes: string[] } | { error: string }`, `writeReview(r: ReviewRecord): string`.

- [ ] Write the tests: each format 1 fixture validates and reads to itself; the writer's output of each validates and round-trips; `review-0-spike.json` reads to the record R11 describes (`file` set, `shown` dropped, `updatedAt` the latest `at`, `revision` 0, every id new and of format 1's shape), and that record with `revision` 1 written validates; a `revision` of 0, of 1.5, or missing is refused by the schema; the schema's `from` description says UTF-16 code units; `{ format: 2 }` gives "This review was saved by a newer gloss."; a `comment` item with no comments, an `overall` item with a `quote`, two `overall` items, and a 101-character name are refused by the schema; 2,000 items of P4's shape write under 1,048,576 bytes; run them; expect FAIL on the missing modules.
- [ ] Write the schema, the record type, and the modules.
- [ ] Run the tests; expect PASS.
- [ ] Commit and push at once (R33), and tell the coordinator the schema's commit so the import can start.

### Task S3: the word diff (lane T, after S1; parallel with S2, S5, S6)

**Files:** `src/domain/text/diff.ts`, `test/domain/text/diff.test.ts`.
**Interfaces:** `tokens(s: string, by: 'word' | 'line'): Token[]`, `changes(a: string, b: string, opts?: { by?: 'word' | 'line'; maxEdits?: number }): DiffChange[] | 'tooMany'` with `DiffChange = { aFrom, aTo, bFrom, bTo }`.

- [ ] Write the tests: equal strings give `[]`; an insertion, a deletion, and a replacement at the start, the middle, and the end; two changes one space apart are one change and two changes a word apart are two (B4, `js/diff.js:57`); letters beyond ASCII form one token; `maxEdits` 5 on six separate changes gives `'tooMany'`; two texts 3,000 word edits apart give `'tooMany'` at `maxEdits` 2,000; `by: 'line'` gives one change per changed run of lines; the cases of `test/fixtures/spike/diff.json` (R41) give the spike's answers; run; expect FAIL.
- [ ] Port `js/diff.js` with R6's prefix and suffix trimming, band-only trace, and edit cap.
- [ ] Run; expect PASS.
- [ ] Commit.

### Task S4a: the edit model on the whole-draft diff (lane T, after S3 and S5; on the critical path)

**Files:** `src/domain/review/{model.ts,applied-map.ts,draft-review.ts}`, `test/domain/review/{applied-map,draft-review,edit-property}.test.ts`.
**Interfaces:** `type NewId = () => string` (R34); `class DraftReview { constructor(file, draft, placed?); applied(): string; edit(changes, newId: NewId, now: string): { changed: Set<string>; removed: Set<string> }; rebuild(text: string, newId: NewId, now: string); toApplied(p); fromApplied(q): { at: number } | { inside: string }; targetFor(from, to): Target; comment(target, text, id, now); deleteComment(itemId, index); undoChange(id): Change; items(): readonly Item[] }`; `edit` applies the changes to its applied text and diffs the whole draft against it (R6, S4a's step).

- [ ] Write the tests: `AppliedMap` agrees with the cases of `test/fixtures/spike/applied.json` (R41); B5 (an overlapping proposal keeps its id and comments; a vanished one's comments become a comment on its old words); B6's `targetFor`; B8's comment rules; B9's `undoChange` gives the change that restores the old words; `rebuild` from a text gives the same items as the edits that made it; `edit-property`: 500 seeded sequences of 1 to 20 random insertions, deletions, and replacements keep `apply(draft, proposals) === editor text`, starting both from an empty review and from proposal sets placed by S5's `placeItems` (I4); run; expect FAIL on the missing modules.
- [ ] Write the modules as R6's first step and R7 say.
- [ ] Run; expect PASS; commit.

### Task S4b: the region diff (lane T, after S4a; beside S7 to S11b)

**Files:** `src/domain/review/{region.ts,draft-review.ts}`, `test/domain/review/{region,edit-timing}.test.ts`.
**Interfaces:** `regions(applied, changes, proposals): Region[]` (R6's widening and merging); `DraftReview.edit` unchanged in signature, now diffing per region.

- [ ] Write the tests: each change widened on its own and only touching regions merged; a region past 2,000 word edits falls back to lines, and past 2,000 line edits to one proposal; a replace-all of a word with 3,000 occurrences in the 10,000-line seeded draft, beside 200 earlier proposals with comments, keeps those proposals' ids and comments and `writeReview` gives under 1,048,576 bytes (R6's probe: 832,713); `edit-timing`: the 10,000-line seeded draft with 2,000 proposals, 30 one-character keystrokes at random places, every sample logged before the assertion; run; expect FAIL; then run S4a's tests unchanged.
- [ ] Write the region diff behind `edit`.
- [ ] Run the timing test five times; set its bound to three times the worst sample and write the five runs' worst and median into the test's comment; run the whole set with S4a's; expect PASS; commit.

### Task S5: quotes (lane T, after S1; parallel with S2, S3, S6)

**Files:** `src/domain/text/quote.ts`, `test/domain/text/quote.test.ts`.
**Interfaces:** `type Quote`, `quoteAt(text, start, end)`, `refind(text, q, start)`, `placeItems(records, draft): { placed; lost: number }`.

- [ ] Write the tests: the cases of gloss's tests for `refind` and `quoteAt` (gloss `test/platform/text/text.test.ts` at `8fc93e7eb`, those that name either), ported with synthetic text; an item whose words moved 3,000 characters lands there; two equal occurrences resolve to the nearer; an item whose words are gone counts as lost (B14); an insertion (empty `exact`) whose prefix and suffix no longer meet counts as lost and is not placed at its old offset (R9, I3); two proposals whose quotes now overlap, and two that land on the same occurrence, place the first in saved order and count the second lost, its comments kept as a comment item (R9, I4); run; expect FAIL.
- [ ] Port R9's functions with a comment naming gloss's file and commit and the two differences.
- [ ] Run; expect PASS; commit.

### Task S6: the Typst parse, readable text, language, and PDF matching (lane T, after S1; parallel with S2, S3, S5)

**Files:** `src/domain/source/{typst-parse.ts,shown.ts,language.ts}`, `src/domain/pdf/match.ts`, `test/domain/source/*.test.ts`, `test/domain/pdf/match.test.ts`.
**Interfaces:** `parseTypst(src): Op[]`, `plainOps(src): Op[]`, `shown(text, ops, from, to)` by binary search, `languageOf(fileName)`, `spellLanguage(src)` (B3), `keyOf`, `sourceKey(file, text, ops)`, `pdfKey(pages: readonly (readonly string[])[])`, `toSource(sk, selected, fraction): { file, from, to } | null`, `placeMarks(pk, items: { id; shown; fraction }[]): PdfPlacement[]` with `PdfPlacement = { id; page; startItem; startOffset; endItem; endOffset }`.

- [ ] Write the tests with expected values from `test/fixtures/spike/{typst,shown,pdf}.json` (R41): the ten synthetic Typst sources give the spike's ops; `shown` agrees with the spike on the 200 seeded ranges; `toSource` agrees with the spike on ligatures (`ﬁ`), a hyphen at a line's end, markup between words, and two occurrences on different pages; `placeMarks` on page strings finds the item's words across two text items; B3's four spell cases; run; expect FAIL.
- [ ] Move `parse` and `dropBlankParagraphs`, write the rest.
- [ ] Run; expect PASS; commit.

### Task S7: the session and its ports (lane T, after S2, S4a, S5, S6)

**Files:** `src/app/{ports.ts,view.ts,session.ts}`, `test/app/session.test.ts`, `test/app/fakes.ts`.
**Interfaces:** the ports of "Layers and interfaces"; `new ReviewSession({ editor, pdf, api, store, clock, ids, scheduler, clipboard, panel, reviewable })`, `panel` a `PanelPort` (R42); saving as the spike does for now: the spike's name-derived key through `api.save` 600 ms after the last change (R38; feature 2 replaces it).

- [ ] Write the tests with fakes for every port: typing gives marks and cards (B4); a selection gives the form's target (B6); a PDF selection gives the target, focuses the form, and scrolls the editor, and an unplaceable one says B7's sentence; comments and undo (B8, B9); a card's focus scrolls both views (B10); the count line, with R40's singular, and card order (B11); the view choice is kept and the PDF shown once (B12); PDF marks are placed once 400 ms after typing stops and only while the PDF shows (R8); editing waits for a name and stops after Send (B13); opening places saved items and says how many are lost (B14); a keystroke calls `upsertCard` only for changed items, `setOrder` only when the order changes, and never re-sends every card (R8, R42); when the fake editor's `text()` differs from the domain's applied text at a save, the session rebuilds from it (R43); run; expect FAIL.
- [ ] Write the session.
- [ ] Run; expect PASS; commit.

### Task S8: the CodeMirror adapter (lane T, after S7; parallel with S9, S10)

**Files:** `src/adapters/codemirror/{editor.ts,typst-language.ts,highlight.ts}`, `test/adapters/codemirror/editor.test.ts` (jsdom).
**Interfaces:** `createEditor(parent: HTMLElement, { text, language, spellLanguage }): EditorPort`.

- [ ] Set up jsdom's layout stubs as gloss's CodeMirror tests do (gloss `test/features/search/find-bar.test.ts:11`, `Range.prototype.getClientRects`).
- [ ] Write the tests: a typed change reaches `onEdit` as old-text coordinates, synchronously and once per transaction, and `setText` does not; two transactions dispatched in one tick give two `onEdit` calls, each in its own transaction's old-text coordinates, and replaying them on the old text gives `text()` (R43); `setMarks` draws `.gr-ins` marks and `del` widgets with `data-items`; `setEditable(false)` refuses input; `scrollTo` past the end clamps; the extensions of B2 are present (search panel opens on Mod-f, go to line on Mod-Alt-g); run; expect FAIL.
- [ ] Port `src/editor.mjs` into the three files, reporting changes through `iterChanges` in an update listener with no `queueMicrotask` (R6, R43).
- [ ] Run; expect PASS; commit.

### Task S9: pdf.js from npm and the PDF adapter (lane T, after S7; parallel with S8, S10)

**Files:** `knip.json` (`pdfjs-dist` out of `ignoreDependencies`), `scripts/build.mjs` (worker and text-layer CSS), `scripts/text-layer-css.mjs`, `js/pdf.worker.js`, `css/pdf-text-layer.css`, `src/adapters/pdfjs/{pdf-view.ts,worker-entry.ts}`, `test/adapters/pdfjs/pdf-view.test.ts` (jsdom, pdf.js mocked at its `getDocument` boundary), `test/structure/no-eval.test.ts`.
**Interfaces:** `createPdfView(el: HTMLElement, { url, workerUrl }): PdfPort` (R36).

- [ ] Write `no-eval.test.ts` over `js/*.js`; run it; expect PASS today on the editor bundle and FAIL when a throwaway `js/x.js` holds `new Function(`; delete the throwaway.
- [ ] Write the adapter tests: pages laid out at their sizes before drawing; a page drawn when observed (a fake `IntersectionObserver`); `show()` answers every page's text items; `setMarks` draws a mark over the right text divs on a drawn page and later on a page drawn after; a selection reports its text and page fraction; run; expect FAIL.
- [ ] Write the adapter and the build steps; run `npm run build`; run the tests and `no-eval.test.ts`; expect PASS.
- [ ] Commit (the vendored pdf.js stays until S11b switches the page).
- [ ] Write the test that a page more than ten pages from the view releases its canvas; run; expect FAIL; write the release; run; expect PASS; commit on its own, as R39 may leave it for the next release.

### Task S10: the server and storage adapters (lane T, after S7; parallel with S8, S9)

**Files:** `src/adapters/http/review-api.ts`, `src/adapters/storage/browser-store.ts`, `src/adapters/browser/{clock.ts,ids.ts,scheduler.ts,clipboard.ts}`, `test/adapters/*.test.ts` (jsdom).
**Interfaces:** `createReviewApi(base: string, requestToken: string): ReviewApi` (on `/draft`; until F1b, `open` and `save` call the spike's `GET /review` and `POST /review` with the key as `reviewer`, `baseRevision` is unused, and a success answers `revision` 0), `createBrowserStore(shareToken: string): BackupStore`, `browserClock`, `browserIds`, `browserScheduler`, `browserClipboard` (`navigator.clipboard.writeText`, false on a refusal).

- [ ] Write the tests: requests carry `requesttoken`; `/draft` parses to `{ main, files }`; an error answer becomes `{ status, error }` and a network failure `{ status: 0, error: 'network' }`; storage keys are R22's, and `readConflict` returns what `keepConflict` kept; the clipboard returns false when `writeText` rejects; a storage that throws on write makes `write` return false; `ids.key()` gives 16 characters of `[A-Za-z0-9]` and `ids.item()` 10 of `[a-z0-9]` over 1,000 draws; run; expect FAIL.
- [ ] Write the adapters; run; expect PASS; commit.

### Task S11a: the islands (lane T, after S7; parallel with S8, S9, S10; UI by its tests)

**Files:** `src/ui/{panel-model.ts,head.tsx,panel.tsx,card.tsx,comment-form.tsx,mount.ts}`, `test/ui/*.test.ts` (jsdom, vnodes built with `h()`), `knip.json` (Preact and signals out of `ignoreDependencies`).
**Interfaces:** `createPanelModel(): PanelModel` (a `PanelPort`, R42), `mountHead(el, model, session)`, `mountPanel(el, model, session)`, each returning `dispose()`; the islands call the session's commands through an interface of them in `src/app/session.ts`, which a test fakes.

- [ ] Write the tests: a card for each kind with today's markup (classes, `data-id`, the buttons' words); `upsertCard` of one item re-renders only its card (a render counter); `setOrder` moves cards without re-rendering them; the form's quote and focus rules (B6, B7); the head's view buttons' `aria-pressed` and Send's disabled state (B11, B13); run; expect FAIL.
- [ ] Write the model and the islands; run; expect PASS; commit.

### Task S11b: the wiring and the spike's scripts gone (lane T, after S8, S9, S10, S11a, S12; UI)

**Files:** `src/main.ts`, `scripts/build.mjs` (entry `src/main.ts`, output `js/gloss-review.js`), `templates/review.php` (R37's slots and `data-reviewable` from a template parameter), `lib/Controller/ReviewController.php` (`page()` loads `gloss-review` and both styles, worker URL `js/pdf.worker.js`, `reviewable` set to true until F1a computes it), `css/review.css`, `test/main.test.ts` (jsdom: `main.ts` builds the model, the session, and the islands in R42's order against the template's markup); deleted: `js/review.js`, `js/diff.js`, `js/pdf-view.js`, `js/typst-view.js`, `src/editor.mjs`, `js/vendor/`, `scripts/spike-golden.mjs`.

- [ ] Write `test/main.test.ts`; run; expect FAIL.
- [ ] Write `main.ts`; switch the template and `page()`; delete the old files; run `npm run build`.
- [ ] Run `npx vitest run test --maxWorkers=8` through the lock, `npm run typecheck`, and `npm run structure` (knip reports nothing unused); `git grep -n "window.Gloss\|sourceOffset\|renderTextLayer\|new Function" -- src js templates test` prints nothing; expect PASS.
- [ ] Hand checks H1, H2, H3, H4, H10, and H11; commit.

### Task S12: the PHP services and PHPUnit (lane P, first; parallel with every lane T task up to S11a)

**Files:** `composer.json` (with `config.platform.php` 8.2, so one lock serves PHP 8.2 and 8.4), `composer.lock`, `phpunit.xml`, `tests/bootstrap.php`, `tests/Unit/Service/{DraftLocatorTest,ReviewStoreTest}.php`, `tests/Unit/Controller/ReviewControllerTest.php`, `lib/Service/{DraftLocator,Draft,ReviewStore}.php`, `lib/Controller/ReviewController.php`, `appinfo/routes.php` (adds `review#draft`), `scripts/php.sh`.
**Interfaces:** `DraftLocator::locate(Folder): ?Draft`; `ReviewStore` with the spike's behaviour (`reviews/` in the shared folder, the create permission, 1 MiB) behind `load(IShare, string $reviewer): array` and `save(IShare, string $reviewer, string $review): void` throwing `ReviewRefused` with a status; the controller only maps.

- [ ] Write `scripts/php.sh` (`composer install`, `test` = `vendor/bin/phpunit`, `lint` = `php -l` over R14's folders) and the tests: B1's choices (first by name, extension case ignored, folders ignored, the PDF of the same base name, the only PDF, two other PDFs give none); the spike's save and load rules; the controller's `draft` answer of R15; run `scripts/php.sh test`; expect FAIL on the missing classes.
- [ ] Move the code out of the controller; add `draft`.
- [ ] Run `scripts/php.sh test` and `scripts/php.sh lint`; expect PASS; if S14 has landed, run H1 once on `scripts/dev-nc.sh` (in debug mode, so `/draft` is routed at once, R28; on an instance started before S14's debug setting, `scripts/dev-nc.sh reset` first); commit.

### Task S13: CI and Dependabot (lane I, after S1 and S12)

**Files:** `.github/workflows/ci.yml`, `.github/dependabot.yml`, `package.json` (script `ci`: typecheck, test, structure, then `npm run build && git diff --exit-code -- js css`).
**Interfaces:** two jobs, `node` (Node 24, `npm ci`, `npm run ci`) and `php` (`shivammathur/setup-php` on 8.2 and 8.4, `composer install`, lint, PHPUnit); Dependabot monthly for `npm` and `composer` at `/`.

- [ ] Change one byte of `js/vendor/editor.bundle.js` (or `js/gloss-review.js` after S11b); run `npm run ci`; expect FAIL at the diff; restore it; run again; expect PASS.
- [ ] Write the workflow and Dependabot file; push; read the run's result on GitHub; commit any fix.

### Task S14: the disposable Nextcloud and the screenshots (lane I, after S1; parallel with everything after it)

**Files:** `scripts/dev-nc.sh`, `scripts/shots.mjs`, `scripts/shots/scenes.mjs`, `test/fixtures/nc/Review/{paper.typ,paper.pdf,.gloss-review}`, `test/fixtures/nc/Plain/{notes.typ}` (no marker), `scripts/make-long-draft.mjs` (the 10,000-line seeded draft of P1, written at start, not committed), `knip.json` (Playwright out of `ignoreDependencies`).
**Interfaces:** `scripts/dev-nc.sh up|down|reset|url <folder>`: container `gloss-dev-nc` from `nextcloud:33-apache` on `127.0.0.1:${GLOSS_DEV_NC_PORT:-8090}`, the repository mounted read-only at `custom_apps/gloss`, the app enabled, `debug => true` set by `occ config:system:set debug --value=true --type=boolean` (R28, routes cached 3 s), an owner user with a generated password, the fixture folders copied into its files and scanned, read-only public links made through the OCS API with `curl -K -` reading the credentials from standard input, and the links and generated passwords written to `.dev-nc.env` (mode 600, gitignored) and never printed; it does not touch `gloss-nc`, its port 8089, or `.local-nc.env`.
`node scripts/shots.mjs <scene> [--out shots/] [--browser chromium|firefox|webkit]` writes `<scene>-light.png` and `<scene>-dark.png`, with the browser's name in the file name when it is not Chromium; `reset` also restarts Apache.

- [ ] Run `scripts/dev-nc.sh url Review` before writing it; expect FAIL (no script).
- [ ] Write the fixtures (synthetic words only; `paper.pdf` made by `typst compile paper.typ`), the script, and the scenes of "Hand checks".
- [ ] Run `scripts/dev-nc.sh up`, then `scripts/dev-nc.sh url Review` (prints a URL with no password), then `node scripts/shots.mjs editor` and `node scripts/shots.mjs editor --browser firefox`; look at the pictures; run `docker exec -u www-data gloss-dev-nc php occ config:system:get debug`; expect `true`; run `scripts/dev-nc.sh down`; commit.

### Task S15: the documents (lane I, after S1; parallel with S2 to S10)

**Files:** `README.md` (an Architecture section: the layers and their rule, the ports, the bundles, the server's classes, and the reviews' location; "Trying it locally" replaced by `scripts/dev-nc.sh`), `CLAUDE.md`, `docs/decisions.md`.
**Interfaces:** `CLAUDE.md` holds the commands, the layer rule (R2), the islands rule (R8, R37), and the hard rules: no real credentials, `.local-nc.env` and `.dev-nc.env` never read into a session or printed, synthetic fixtures only, no signing key ever read, stored, or used, British English, no em-dashes, one sentence per line; `docs/decisions.md` holds RVW-1, RVW-2, RVW-3, RAW-1 (raw source, with the PDF beside it), TS-1 (TypeScript strict with esbuild, R3), TEST-1 (Vitest, R4), FORMAT-1 (R10, R11, R33: format 1 with its `revision` field is the contract with gloss's import; `from` counts UTF-16 code units; the spike's reviews in a shared folder's `reviews/` are abandoned by the app and not read by the import), PLACE-1 (R16, R17), KEY-1 (R18, R20), SAVE-1 (R22, R23: saves by revision, one in flight, a retry of a landed save answers success), and RVWPW-1 = A (your answer of 2026-11-15 20:04: no password prompt of the page's own, R32), each with the words quoted in the brief or your answer and the why.

- [ ] Write the three files; `grep -nP '\x{2014}' README.md CLAUDE.md docs/decisions.md` prints nothing; commit.

### Task F1a: reviews beside the shared folder, server side (lane P, after S12; its `page()` change after S11b; merged with F1b)

**Files:** `lib/Service/{ReviewKey,ReviewStore,StoredReview}.php`, `lib/Exception/ReviewRefused.php`, `lib/Controller/ReviewController.php` (the new actions, and `page()`'s `reviewable` from `ReviewStore::isReviewable`), `appinfo/routes.php` (R20's table; the spike's review routes and `/text` go), `tests/Unit/Service/{ReviewKeyTest,ReviewStoreTest}.php`, `tests/Unit/Controller/ReviewControllerTest.php`; the template is S11b's and F1a does not touch it (plan review 1, M10).
**Interfaces:** `ReviewKey::parse(string): ?ReviewKey`, `->fileSuffix(): string`; `ReviewStore::isReviewable(IShare): bool`, `open(IShare, ReviewKey): ?StoredReview` (`content`, `revision`), `save(IShare, ReviewKey, string $review, int $baseRevision): SaveResult` (`revision`, `sentNow`, `fileId`, `path`, `name`); refusals as `ReviewRefused(status, code)`; the store takes `ILockingProvider` for R22's lock.

- [ ] Write the tests: R16 (no marker, a 5 KiB marker, a marker holding `[1]` are not reviewable; an empty marker and `{}` are; the reviews folder is `Review reviews` beside `Review` in the owner's folder, looked up through a mocked `IRootFolder` with the share's owner and node id, made on the first save; a file of that name answers `reviewsBlocked`); R18 (keys of 15 and 17 characters, with `/`, `.`, and non-ASCII are refused; the file name's slug from "Ada Lovelace" is `ada`, from "" is `reviewer`; open finds the file by its suffix and not another reviewer's); R19 (1,048,577 bytes, depth 17, `format` 0, a `revision` that is not an integer, and a 51st file are refused); R21 (a save over a sent review with other bytes is refused; false to true gives `sentNow`, true to true with other bytes is refused); R22, row by row (a first save with `baseRevision` 0 writes revision 1; a stale `baseRevision` gives `conflict` with the stored revision; `baseRevision` 0 on an existing file gives `conflict`; a held lock gives 423 `busy`, and the lock is released after every answer, a refusal or an exception among them); the lost answers of C1, each as two calls with the same bytes where the first one's answer is dropped: a first save, a later save, and a Send, each second call answering success with the stored revision, leaving one file, and for Send giving `sentNow` only on the first; `open` of a well-formed unknown key gives `null`; the controller maps each code to R20's status, answers `{ review: null }` with 200 for an unknown key, carries no `BruteForceProtection` on either action (read by reflection) and throttles no answer (`Response::isThrottled()` false, `lib/public/AppFramework/Http/Response.php:413`), and sets `reviewable` for the template; run `scripts/php.sh test`; expect FAIL.
- [ ] Write the services and the controller's new actions.
- [ ] Run `scripts/php.sh test` and `lint`; expect PASS; commit; hand off to F1b for the joint merge.

### Task F1b: read-only links and keys, page side (lane T, after S11b and F1a; merged with F1a; UI)

**Files:** `src/adapters/http/review-api.ts` (R20's routes), `src/app/session.ts`, `src/ui/head.tsx`, `src/ui/panel.tsx`, `test/app/session-reviewable.test.ts`, `test/adapters/http/review-api.test.ts`.

- [ ] Write the tests: with `reviewable` false the page shows "This link is not set up for reviewing.", the editor is read-only, there is no name field and no Send, and `api.save` and `api.open` are never called; with it true, the first name makes a key through `ids.key()`, remembers it for the link, and saves to it with `baseRevision` 0; a remembered key whose backup has `saved` true opens its review on load; a reload before the first save landed calls no `open` and restores the backup (I2); `open` answering `{ review: null }` starts an empty review on that key; 403, 404, 409 (`conflict`, `sent`, `full`, `reviewsBlocked`), 410, 413, and 429 each show their sentence (R16, R19, R21, R22, R23); run; expect FAIL.
- [ ] Write the changes; run the tests and S7's; expect PASS.
- [ ] Hand checks H1 (saving on a read-only link with the marker) and H5; commit; merge F1a and F1b together after their reviews.

### Task F2: saving that survives (lane T, after F1b; UI)

**Files:** `src/app/save-queue.ts`, `src/app/session.ts`, `src/adapters/storage/browser-store.ts`, `src/main.ts` (`beforeunload`, `pagehide`, `online`), `src/ui/head.tsx` (status), `src/ui/panel.tsx` and `src/ui/conflict.tsx` (the kept changes, R22), `test/app/save-queue.test.ts`, `test/app/session-backup.test.ts`, `test/app/session-send.test.ts`, `test/ui/conflict.test.ts`.
**Interfaces:** `new SaveQueue({ save, scheduler, onStatus })` with `changed()`, `flush(): Promise<Outcome>`, `online()`, `pagehide()`, `dirty`, `pending`.

- [ ] Write the tests on a fake scheduler: one save 5 s after a burst; at most one save in flight, and a change made during it saved after its answer with the next `baseRevision`; a save with no answer is retried with the same bytes and revision at 2, 5, and 15 s, then every 15 s; `online()` retries at once; 400, 403, 404, 409, 410, 413, and 429 stop retrying and keep the backup; the status texts of R23; dirty until the save that carried the last change succeeds; the three lost answers of C1 against a fake server with R22's table (first save, later save, Send), each ending in one stored review and "Saved" or "Review sent. Thank you."; a reload with a `pending` body resends it first; R22's restore cases (the backup's `revision` equal to the server's, its `pending` carrying the server's revision, neither) and the full-storage case; the conflict case shows "Show the changes from this browser", and pressing it shows the kept items as read-only text; Send: success, a refusal that clears `sent` and allows editing, and a retryable failure with "Not sent yet; trying again in N s" (M6); `pagehide()` saves with `keepalive` under 64 KiB and leaves a larger body to the backup; the leave-page question while dirty only; run; expect FAIL.
- [ ] Write the queue, the restore, and the conflict view; replace S7's interim saving.
- [ ] Run; expect PASS; hand check H6, then open the review file's Versions tab as the owner and write the number of versions H6 made into the commit message (M11); commit.

### Task F3: the review link (lane T, after F1b; after F2 or beside it on separate files; UI)

**Files:** `src/ui/review-link.tsx`, `src/ui/panel.tsx`, `src/app/session.ts`, `src/main.ts` (reads `location.hash`, passes `browserClipboard`), `test/app/session-link.test.ts`, `test/ui/review-link.test.ts`.

- [ ] Write the tests: no link before the first successful save, then the page's address plus `#<key>`; Copy writes it through the `Clipboard` port (R42) and says so, or says "Copy failed; select the link and copy it." when the port returns false; a page opened with a valid fragment opens that review, fills the name, and remembers the key; an invalid fragment is ignored; run; expect FAIL.
- [ ] Write it; run; expect PASS; hand check H7; commit.

### Task F4: the overall comment (lane T, after S11b; beside F2 or F3, on separate files except `session.ts` and `panel.tsx`, merged after F2 and before F3; UI)

**Files:** `src/ui/overall.tsx`, `src/ui/panel.tsx`, `src/app/session.ts`, `test/app/session-overall.test.ts`, `test/ui/overall.test.ts`.

- [ ] Write the tests: typing in the box makes or updates the one `overall` item and marks the review changed; clearing it removes the item; Send is enabled by an overall comment alone; the count line is unchanged; the box is read-only after Send and on an unreviewable link; run; expect FAIL.
- [ ] Write it; run; expect PASS; hand check H8; commit.

### Task F5: the notification on Send (lane P, after F1a)

**Files:** `lib/AppInfo/Application.php`, `lib/Notification/Notifier.php`, `lib/Service/SentNotifier.php`, `lib/Controller/ReviewController.php` (calls `SentNotifier` on `sentNow`), `tests/Unit/Notification/NotifierTest.php`, `tests/Unit/Service/SentNotifierTest.php`, `tests/Unit/Controller/ReviewControllerTest.php`.

- [ ] Write the tests: one notification to the owner with R26's app, object, subject, and parameters when `sentNow`, none otherwise, and none for a retried Send that R22 answers as landed; `prepare` gives the rich subject "{reviewer} sent a review of {draft}" with a `highlight` and a `file` parameter and the link to the file; another app's notification raises `UnknownNotificationException`; a deleted review file raises `AlreadyProcessedException`; run `scripts/php.sh test`; expect FAIL.
- [ ] Write the classes; run; expect PASS; hand check H9; commit.

### Task R1: the release archive (lane I, last)

**Files:** `scripts/package.sh`, `scripts/third-party.mjs`, `THIRD-PARTY.md`, `test/structure/package.test.ts`, `appinfo/info.xml` (`<version>0.1.0</version>`).

- [ ] Write the test: it runs `scripts/package.sh` into a temporary folder and lists the archive: every path under `gloss/`, the allowlist present, `THIRD-PARTY.md` naming pdf.js, CodeMirror, Lezer, Preact, and its signals with their licence texts, none of R31's forbidden paths, `.dev-nc.env` and any `.env*` among them, checked by planting each in a scratch copy; run; expect FAIL.
- [ ] Write `scripts/third-party.mjs` (R5) and the script; run `node scripts/third-party.mjs`; run the test; expect PASS; commit; tell the coordinator the archive's path for your signing.

## Order and lanes

| Lane | Tasks, in order | Starts |
| --- | --- | --- |
| T, TypeScript | S1, then S2, S3, S5, and S6 in parallel, then S4a (needs S3 and S5), S7, then S8, S9, S10, and S11a in parallel, then S11b, F1b, F2, and F3; S4b beside S7 to S11b; F4 beside F2 or F3 | at once |
| P, PHP | S12, F1a, F5 | at once |
| I, infrastructure | S14 and S15 after S1; S13 after S1 and S12; R1 last | after S1 |

The critical path is S1, S3, S4a, S7, the slowest of S8 to S11a, S11b, F1b, F2, and F3: nine build sessions one after another, with lanes P and I and the parallel tasks beside them; S4b, the riskiest task, is off it (plan review 1, I8).
S2 is pushed first in lane T, since gloss's import is built on Wednesday morning against it (R33).
Merge order where tasks share files: F1a's `page()` change after S11b (M10); F1a and F1b together (R38); then F2, F4, and F3, in that order, each rebased on the one before (M10).
**Checkpoint, Tuesday 2026-11-17 at 20:00:** S1, S2, S3, S4a, S5, S6, S7, S8, S9, S10, S11a, S11b, S12, S14, S15, and F1a are merged; the build session checks this then and tells the coordinator, and if any is missing R39's deferrals and cuts start at once.

## Hand checks

Each runs on `scripts/dev-nc.sh up` with `node scripts/shots.mjs <scene>`, which writes the light and the dark picture; the builder looks at both and names in the task's commit what each shows.
Nextcloud caches routes for 3,600 s unless `debug` is on (I9): `dev-nc.sh up` turns it on, and an instance started before S14's version of the script is restarted with `scripts/dev-nc.sh reset` before a hand check that follows a route change (S12, F1a, F1b).

- **H1, editor.** The `Review` link, a name typed, one word replaced, one inserted, and one deleted in the editor, and a comment added on a selection: underlines and strikes legible in both themes, the cards in draft order, the count line "3 changes, 1 comment" (R40).
- **H2, pdf.** The PDF view with a mark over a commented passage, and a PDF selection with the form open and the editor scrolled; in Chromium, Firefox, and WebKit (R28, M13).
- **H3, both.** Editor and PDF side by side with the panel, at 1,600 by 1,000 pixels; in Chromium, Firefox, and WebKit.
- **H4, search.** The search panel open with matches highlighted, and the go-to-line prompt.
- **H5, not set up.** The `Plain` link (no marker): "This link is not set up for reviewing.", the draft shown read-only, no name field, no Send.
- **H6, waiting.** Saves dropped by the scene's network route after the server wrote them (the answer lost): "Not saved yet; trying again in 2 s"; then let through: "Saved", with one review file; then the owner's Versions tab of that file, its count written into the commit (M11).
- **H7, review link.** After the first save, "Your review link" with its Copy button; a second, fresh browser context opening that link shows the same review and name.
- **H8, overall.** The overall comment box with text at the top of the panel, the count line unchanged.
- **H9, bell.** The owner logged in after a Send, the notifications menu open on "<name> sent a review of paper.typ".
- **H10, sent.** After Send: "Review sent. Thank you.", the editor read-only, the card buttons gone.
- **H11, long.** The generated 10,000-line draft opens, and the scene logs the time from each of 20 keystrokes to the panel's update; the worst is under 100 ms.

## Not in this plan

- A password prompt of the page's own (R32; your answer RVWPW-1 = A).
- Multi-file drafts beyond the seam (feature 6).
- Send this section, which gloss's exploration lists (gloss `docs/design/review-by-others.md:25`) and the brief's features do not.
- Nextcloud 34: `appinfo/info.xml` declares `max-version="33"`, so when your server moves to 34 the app is disabled until a release declares 34; Packagist already has `nextcloud/ocp` `dev-stable34` (P7's listing).
- Translations: the strings go through `IL10N` on the server (R26) and are English on the page.

## Review 1 findings

Each finding of plan review 1 (`/home/kiibou/.cache/gloss-work/rvw/plan-review-1.md`, plan at `c8d1077`) and where this revision answers it.
Counts: 24 findings (C1, I1 to I9, M1 to M14, M14's five points as one), 24 fixed, 0 ruled not a defect.

| Finding | Outcome | Where and why |
| --- | --- | --- |
| C1, lost answer becomes a conflict | fixed | format 1's `revision` (R10), R22's table with the idempotent row and a named lock, one save in flight resent byte for byte (R22, R23), R21's retried Send, tests in F1a, F2, and F5, A4 |
| I1, 404 and 429 retried for ever | fixed | R23 stops on 404, 410, and 429 with their sentences and keeps the backup; F1b and F2 test them |
| I2, unknown key throttled | fixed | R20: `open` answers `{ review: null }` unthrottled; R22: `open` only for a key with `saved` or from the fragment; F1a, F1b test it; the throttle's removal is parked |
| I3, insertion placed silently | fixed | R9 counts an empty quote whose context is gone as lost; S5 tests it |
| I4, overlapping placed proposals | fixed | R9's `placeItems` loses the later overlap; S5 tests it; S4a's property test starts from placed sets, A3 |
| I5, spike oracles deleted and unreachable | fixed | R41's golden JSON, made in S1, read by S3, S4a, and S6, its script deleted in S11b |
| I6, panel ports and islands circular | fixed | R42's ui-owned `PanelModel` with fine-grained `PanelPort` calls, built before the session; S7, S11a, S11b |
| I7, region diff unbounded, replace-all collapses | fixed | R6: per-change regions, D capped at 2,000, line diff then one proposal above it; S3 and S4b test the cap and a 3,000-occurrence replace-all (0.79 MiB probe) |
| I8, no checkpoint, risky tasks on the path | fixed | S4 split into S4a and S4b, S11 into S11a and S11b, licence gathering moved to R1; R39 and "Order and lanes" set the Tuesday 2026-11-17 20:00 checkpoint |
| I9, route cache hides new routes | fixed | R28 and S14 set `debug => true`, `reset` restarts Apache; the note heads "Hand checks" |
| M1, `vendor/` ignores `js/vendor/` | fixed | S1 writes `/vendor/` and checks `git check-ignore` |
| M2, `package.json` collisions, no Preact | fixed | S1 adds every pinned dependency and the JSX settings, knip ignoring each until its task; S14 after S1 |
| M3, format 0 ids, spike files unreachable | fixed | R11 gives format 0 items new ids and abandons the spike's reviews; S2 tests read then write; S15 records it |
| M4, units of `from` | fixed | R10 and the schema say UTF-16 code units; S2 tests the description |
| M5, conflict copy never read | fixed | R22's "Show the changes from this browser"; `readConflict` in the port; F2 tests it |
| M6, Send and the queue | fixed | R23's Send states; F2's `session-send` tests |
| M7, mixed change coordinates, no drift check | fixed | R43: one synchronous report per transaction, a comparison per save and a rebuild; S7 and S8 test it |
| M8, no clipboard port | fixed | R42 adds `Clipboard`; S10 writes the adapter; F3 uses it |
| M9, archive test misses `.dev-nc.env` | fixed | R31 and R1 forbid `.dev-nc.env` and `.env*` |
| M10, shared files unordered | fixed | S11b owns the template and `data-reviewable`; F1a changes only `page()` after S11b; merge order F1b, F2, F4, F3 |
| M11, versions and sync per save | fixed | R23 saves 5 s after the last change, at once on Send and `pagehide`; H6 counts the versions |
| M12, security review on hold | fixed | the header schedules none; the points are parked below |
| M13, Chromium only | fixed | R28 and H2, H3 in Firefox and WebKit |
| M14, five small points | fixed | `NewId` in R34 and S4a; S8 points at gloss's jsdom stubs; R40 and B11 name the spike bug; R19's `full` sentence; R4 and S1's `test` script fix no worker count |

## Parked security points (CR-244)

Security reviews are on hold (CR-244); these points from plan review 1 are recorded and not acted on in this plan.

- R16 and R17: anyone who can create files in the shared folder (an editable link, a file-drop link, a collaborator) can create `.gloss-review` and so enable anonymous writes beside it; the marker shows consent only if you alone can write that folder.
- R17: with no permission check, an upload-only file-drop link to a folder serves its draft and PDF through the review page (spike `ReviewController.php:52-55` checks only that the node is a folder), and "hide download" is ignored.
- R16: for a reshared folder `getShareOwner()` is the original owner, so reviews and notifications go to someone who did not make the link; an existing unrelated folder named `<name> reviews` is written into.
- R12: unvalidated bytes from any link holder land in your files, up to 50 MiB plus versions (M11).
- R20: `open` and `save` register no throttle attempts (I2), trading a defence in depth for availability.
