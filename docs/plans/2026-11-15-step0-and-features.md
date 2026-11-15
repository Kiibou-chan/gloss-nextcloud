# gloss for Nextcloud, step 0 and the review features: implementation plan

> **For agentic workers:** build task by task, test-first; steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the spike's review page rebuilt in layers (a pure domain, an application layer with ports, adapters, a Preact panel, and wiring), in strict TypeScript with structure checks, PHPUnit, and CI, with no behaviour lost; then the review features: read-only links with reviews written beside the shared folder (RVW-3 B), saving that survives a bad network, a review link that opens the review on any device, an overall comment, and a notification on Send.
**Status:** first draft, for its plan review; no implementation is authorised by this draft alone.
**Request:** the brief `/home/kiibou/.cache/gloss-work/rvw/brief-plan.md`, with your rulings of 2026-11-15 as it quotes them: RVW-1 = C, RVW-2 = "A and B ideally", raw source with the PDF beside it, RVW-3 = B, "at least in the long run" multi-file drafts, good coding practice and clean architecture, and "Sounds good" to step 0 and the feature list.
**Base:** branch `spike-review` at `baf4dad`; every handle below holds there unless it names another repository.
**Plan branch:** `plan-step0`, from the base; it changes only this plan.
**Deadline:** reviewers from Wednesday 2026-11-18; gloss's import of reviews on Wednesday morning reads format 1 (task S2 freezes it first); you sign and release on the App Store on Wednesday afternoon, and no task touches a signing key.
**Build:** one build session per task, test-first, each new test seen red before its code; lanes and parallel tasks are in "Order and lanes".
**Review:** the plan review and its one recheck; the build's first review from the correctness angle, and a security review of tasks F1a and F1b, which open anonymous writes into your files.

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
- B11. Cards are in draft order, under the count line "N changes, M comments" (`js/review.js:152-158`).
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

  The memory is the trace: every step of Myers' loop copies the whole diagonal array of 2(n + m) + 3 entries (`js/diff.js:17`, `:21`), so memory grows as (n + m) times the number of edits, and the time with it; at 2,000 items a keystroke would need over 10 GB.
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
| Proposals after a keystroke | whole-draft diff, 81 ms to 3.4 s, memory (n + m) times edits (P1) | diff of the changed lines only, linear memory | R6 |
| Draft offset to editor offset | sort per call, O(P² log P) per redraw (P2) | prefix sums, O(log P) per call, O(P) per edit | R7 |
| Editor text per keystroke | `doc.toString()` of the whole draft (`src/editor.mjs:89`) | the changed ranges and their new text | R6 |
| Cards per keystroke | all rebuilt (`js/review.js:152-158`) | keyed, only changed cards redrawn | R8 |
| PDF marks per keystroke | all placed again (P3: 324 ms at 2,000) | after 400 ms without typing, while the PDF shows, changed items only | R8 |
| Readable text of an item (`shown`) | filter of every op per item (`js/review.js:38-39`) | binary search over the ops | R8 |
| Placing saved items on load | `indexOf` over the draft per item (`js/review.js:42-50`) | gloss's `refind`, near the saved offset first | R9 |
| Saved review | 0.88 MiB at 2,000 items (P4) | 0.78 MiB; over 1 MiB is refused with a message | R10, R19 |
| Backup in the browser | none | written 300 ms after the last change, and on leaving | R22 |
| Review files per link | unbounded | 50 | R19 |

The edit path is the only superlinear work found; R6 and R7 make a keystroke cost the changed lines plus O(P), and task S4's timed test holds it there.
