# gloss for Nextcloud, proposals drawn on the PDF: implementation plan

> **For agentic workers:** build task by task, test-first; steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a reviewer sees their own proposals on the uploaded PDF, which stays unchanged: in "Changes" (the default) deleted words are struck through in place and inserted words sit in a small mark at that spot; in "New text" deleted words are covered by the page's background and the new words are drawn over that spot with the proposal highlight, overflow going into a small callout; for Typst and LaTeX alike, with no compiling in the browser.
**Status:** first draft, for plan review.
**Request:** the coordinator's brief of 2026-11-16 for decision PDFP-1 = B (`docs/decisions.md:114-122`), and your addendum of 2026-11-16 at 10:46 as the coordinator relayed it: a two-way switch in the PDF view's bar, "Changes" (default) and "New text"; "No reflow: where the new words need more room than the old ones occupied, draw them at the same size and put the overflow in a small callout at that spot, never shrinking text below legibility"; the choice "kept per browser like the existing view preference (token-keyed)"; the live check covering both modes, light and dark; "Changes" tasks first and releasable alone, "New text" in separate tasks with their own tests, and a marked cut line.
**Base:** branch `pdf-proposals` at `3c22085` ("Record PDFP-1: proposals drawn on the PDF"); every handle below holds there unless it names another repository.
**Plan branch:** `pdf-proposals`; this plan is its only change until the build starts.
**Deadline:** READY on Tuesday 2026-11-17 in the evening; release 0.1.1 on Wednesday 2026-11-18 (`docs/decisions.md:121`); no task touches a signing key.
**Build:** test-first, each new test seen red before its code; tasks marked **Codex** suit one Codex run each, and the pictures of a UI task are looked at by the session that drives it; lanes, the checkpoint, and the cut line are in "Order and lanes".
**Review:** one plan review and its recheck; the build's first review from the correctness angle.

## What exists today

- **Matching.** `src/domain/pdf/match.ts` keys both sides on NFKC lower-cased letters and digits (`keyOf`, `:9-22`): `sourceKey` maps each key character to its source offset (`:24-36`), `pdfKey` to `{page, item, offset, endOffset}` (`:39-55`); `nearest` keys its needle on every call and picks the occurrence nearest the item's fraction of the draft, the first on a tie (`:57-66`); `placeMarks` turns a hit into one `PdfPlacement` per page (`:76-107`, the per-page emit at `:95-104`).
- **Ops.** Typst drafts get `parseTypst`, every other language `plainOps` (`src/app/lifecycle.ts:22`), which takes every source character (`src/domain/source/typst-parse.ts:8-12`), so a LaTeX key holds command names such as `textbf` and `section`; the ops feed only `sourceKey` (`lifecycle.ts:23`, used by PDF selections at `src/app/session.ts:60`) and `shown` (`src/app/pdf-marks.ts:49`).
- **The PDF pass.** `PdfMarks.deferPdf` builds a signature of every item per render (`pdf-marks.ts:34`), reschedules a 400 ms timer (`:38`), re-places only items whose `[from, quote, proposal]` changed (`:44-50`) by `shown` plus `placeMarks` on the item's draft words, and calls `pdf.setMarks` only on a change (`:53`); every item, proposal or comment, gets the same yellow highlight over its old words (`css/review.css:38`).
  A pure insertion (empty `quote.exact`) gets no mark, since `nearest` returns null for an empty needle (`match.ts:60`).
- **The adapter.** `drawMarks` (`src/adapters/pdfjs/pdf-view.ts:31-65`) loops over every placement for every page and calls `findIndex` per placement (`:38`), reads the page box's rectangle inside the inner loop (`:50`), and draws one `div.gr-pdf-mark` per client rectangle of a DOM range on the text layer; marks are redrawn after a page's text layer renders (`:122`) and on every `setMarks` (`:218-221`); the file is at its size baseline of 240 lines (`test/structure/size.test.ts:8`).
  The page is white in both themes (`css/review.css:35`), and the marks layer takes no pointer events (`:37`).
- **Items that cannot be placed.** Saved items that no longer match the draft go to the "Could not place" section (`src/app/items.ts:13-16`, `src/ui/unplaced.tsx`); an item placed in the draft but not on the PDF keeps its card and simply has no mark, and a click on its card scrolls the editor and finds no mark to scroll to (`items.ts:50-53`, `pdf-view.ts:222-228`).
- **The view preference.** `createBrowserStore(shareToken)` keeps the view in `localStorage` under `gloss-review-view:<token>`, reading through `preference()`, which migrates a legacy path-keyed value once (`src/adapters/storage/browser-store.ts:21-30`, `:46-50`); the switch is the `gr-views` group in the header island (`src/ui/head.tsx:10-12`).
- **Pictures.** `scripts/shots/scenes.mjs` has `editor` (replace "grow" by "flourish", insert " softly" after "sing", delete "drift", comment on "stones"; `:41-67`), `pdf` (`:91-97`), and `both` (`:229-233`), on the Typst fixture `test/fixtures/nc/Review/`; there is no LaTeX fixture, and `scripts/dev-nc.sh` copies and shares only `Review`, `Plain`, and `Long` (`:79`, `:173-175`).

## Probes

On this laptop, Node 26.8.1, synthetic text only; the scripts are in `~/.cache/gloss-work/pdfprop-probes/` (`place.mjs`, `ladder.mjs`, `latexops.mjs`, `sig.mjs`); `ladder.mjs` reads PDFs with gloss's `pdfjs-dist` 6.3.289 legacy build, where the app bundles 6.5.438, and only `getTextContent` strings are used.

- **P1, placing 2,000 items on the 10,000-line draft.** `place.mjs` on `longDraft()` (`scripts/make-long-draft.mjs`), its lines laid out 50 to a page (201 pages), 2,000 seeded one-to-three-word items:

  | Path | Time for 2,000 | Right occurrence |
  | --- | --- | --- |
  | today's: `shown` then `placeMarks` | 557 to 575 ms | not checked |
  | key slice, no context, global `nearest` | not timed | 1,476 (524 land on another occurrence) |
  | key slice with 24 key characters each side, global `nearest` | 318 to 322 ms | 2,000 |
  | the same, searched first in a window of ±2,000 key characters around the fraction | 6.2 ms | 2,000 |
  | insertion points only (empty middle), windowed | 161 ms with `indexOf` from the window start, 6.2 ms on a sliced window | 2,000 |

  `sourceKey` took 110 to 132 ms and `pdfKey` 140 to 162 ms, once each per page load.
- **P2, the context ladder on real PDFs.** `ladder.mjs` on the Typst fixture and on a synthetic LaTeX page built with `pdflatex` (a numbered `\section`, a `\subsection`, `\emph`, `\textbf`, a `%` comment, and a paragraph that wraps), for each case trying the needle with both contexts, then before-context only, after-context only, and the words alone; the output is in `ladder.out` there.
  - Typst: deletion, replacement, insertion, both headings, and a span across a paragraph break all place on the first rung.
  - LaTeX with today's `plainOps`: every single-word case places, but mostly on a one-sided rung, and "towards the \textbf{orchard}" does not place at all.
  - LaTeX with a prototype that drops command names, comments, and key arguments: every case places, eight of ten on the first rung; the other two sit next to the section number "1.1" the PDF prints and the source does not, and take the one-sided rung.
- **P3, the per-render signature.** `sig.mjs`: the signature of `pdf-marks.ts:34` over 2,000 proposals costs 0.63 ms median and 1.31 ms worst in 20 runs.

## Size limits and the typing path

| Work | Today | After this plan | Ruling |
| --- | --- | --- | --- |
| Per keystroke | signature of every item, 0.63 ms median at 2,000 (P3) | unchanged | R10 |
| First PDF pass, 2,000 items | 557 ms (P1) | about 6 ms of search plus the segment emit, timed by a test | R3, R4 |
| Later passes | changed items only | changed items only | R10 |
| Drawing | every placement per page, `findIndex` per placement (O(P²) worst) | placements grouped by page once, each page draws its own | R7 |
| Marks drawn | pages with a text layer (R36 of the step 0 plan keeps them near the view) | unchanged | R7 |

## Design rulings

### Placing (both modes)

(R1) Ruling: a new pure module `src/domain/pdf/proposal-marks.ts` places one item from its draft offsets, built on `match.ts`, which exports a keyed `nearestKey` (the body of `nearest` without its `keyOf`) and its per-page emit as `segments`; why: `match.ts` already holds the key and the page split the brief names (lodge d-7779qs), and draft offsets are what an item has (`src/domain/review/model.ts`, `from` and `quote.exact`), while the PDF shows the draft and not the applied text; cost if wrong: none for comments, whose needle is the same key slice `shown` gave (R5).

(R2) Ruling: an item's words are the source-key slice `[lower(at, from), lower(at, to))`, found by binary search on `sourceKey`'s `at`, with no re-keying; why: `sk.at` is sorted by construction (`match.ts:24-36`), and the slice equals `keyOf(shown(...))` because `shown` takes the same text ops and `keyOf` drops what `shown` collapses (`src/domain/source/shown.ts:9-30`); cost if wrong: none measurable, P1's key-slice rows include the search.

(R3) Ruling: the needle carries 24 key characters of context on each side, and a ladder tries both contexts, then before-context only, then after-context only, then the words alone, the first rung that finds a hit winning; an insertion skips the last rung; why: P1 shows 524 of 2,000 words alone landing on another occurrence and none with context, and P2 shows the one-sided rungs placing headings next to section numbers and words next to markup; cost if wrong: a word placed by the last rung may sit on a nearby occurrence of the same word, which a hand check would show.

(R4) Ruling: `nearestKey` first searches a window of ±2,000 key characters around `fraction × key.length` on a sliced string, and falls back to the whole key when the window's best hit is not strictly closer to the centre than the window's half-width; why: P1, 6.2 ms against 318 ms for the same answers; a hit outside the window is at least the half-width away, so the window's strictly-closer best is the global best and the tie rule (`match.ts:57`) holds; cost if wrong: none for answers, which a seeded property test compares with today's `nearest`.

(R5) Ruling: comments go through the same ladder as proposals and keep their yellow highlight; `PdfMarks` stops calling `shown`; why: one implementation for one job, placing an item's words on the PDF (lodge d-7779qs), and R2 makes the last rung exactly today's search; cost if wrong: a comment near markup lands on a different occurrence than today, only where today's lands on the wrong one (P1).

(R6) Ruling: an item placed gives struck segments (the words' hit, split per page by `segments`) and, for a proposal with new words, a caret: after the last struck character for a replacement; after the key character before the point when the hit carried before-context, otherwise before the next key character, for an insertion; a proposal whose old words hold no key character and whose new words hold none is drawn as a caret with the label "(line break)"; why: a caret after the preceding word reads as "add here", the after-context rung has no preceding character in the hit, and "(line break)" is the card's wording for the same case (`src/ui/proposal-words.tsx:6`); cost if wrong: a caret at the start of the next line rather than the end of the previous one.

(R7) Ruling: `PdfPort.setMarks` takes one list of `PdfMark`, a union of `PdfPlacement & { look: 'note' | 'struck' }` and `PdfCaret & { look: 'insert'; words: string; deleted: string }`, defined in `src/app/ports.ts`; the drawing moves to a new adapter file `src/adapters/pdfjs/mark-draw.ts`, which groups marks by page once per `setMarks` and reads the page box once per page; every mark keeps the class `gr-pdf-mark` and `data-id`, with a look class added; why: one list keeps `scrollToMark` one lookup by id (`pdf-view.ts:222-228`) and the shots' `.gr-pdf-mark` checks working (`scenes.mjs:95`), `pdf-view.ts` is at its 240-line baseline (`size.test.ts:8`), and the per-placement `findIndex` is the O(P²) of "What exists today"; cost if wrong: one union type to narrow in the adapter.

(R8) Ruling: a caret is drawn from the client rectangle of the one character beside it (its right edge for "after", its left for "before"), never from a collapsed range; why: a collapsed range's `getClientRects` is empty in some engines, and the H1 hand check runs Firefox and WebKit (`CLAUDE.md:39`); cost if wrong: none.

(R9) Ruling: the marks keep fixed colours in both themes: struck words a 2 px line through their middle in `#c23b3b`, the caret a 2 px bar and its label in `#2e9d4f` on white with a 1 px border, at 11 px, at most 40 characters with an ellipsis; the marks layer keeps no pointer events, so the label has no hover title and the card holds the full text; why: the page is white in both themes (`css/review.css:35`), these are the editor's light colours (`:43-44`), and pointer events on labels would block selecting the PDF text under them (`:37`, B7 of the step 0 plan); cost if wrong: long inserted sentences are cut on the page, and labels of neighbouring insertions on one line can overlap.

(R10) Ruling: the per-render signature (`pdf-marks.ts:34`) and the 400 ms deferral stay; the first pass is not chunked; why: P3's 0.63 ms median per keystroke at 2,000 items, and R4's 6 ms first pass; `CLAUDE.md:66` asks for the deferral and changed items only, which the cache already does (`pdf-marks.ts:44-46`); cost if wrong: the timing test of task B1 fails, and chunking is added then.

(R11) Ruling: LaTeX drafts get `latexOps` in a new `src/domain/source/latex-ops.ts`, ported from gloss's LaTeX letter scan (`src/features/preview/logic/preview-words.ts:18-60` and `:65-89` at `e9cb47e5f`: `KEY_COMMAND`, `argumentEnd`, `keyArguments`, the escape and `%` rules), returning text ops over the source outside command names, comments, and key arguments, plus one rule of its own, the preamble before `\begin{document}` dropped; `LETTER_COMMANDS` is not ported; a comment in the file names the source and commit; why: it is the part that already does this job (lodge d-7779qs), ported as R9 of the step 0 plan ported `refind`, P2 shows spans across markup failing without it, and ops feed only the key and `shown` (`lifecycle.ts:22-23`), so the editor's text is untouched; PDF selections in LaTeX (B7) also start matching across markup; cost if wrong: a word spelled with `\ss` or `\o` loses its context rungs, and a selection across markup that today fails starts placing.

(R12) Ruling: an item that is in the draft but finds no place on the PDF keeps its card, which gains the line "Not shown on the PDF." while the PDF or Both view shows; the "Could not place" section stays as it is; why: the brief's "never lost" and "keep that" (`items.ts:13-16`, `unplaced.tsx`), and a card that scrolls to nothing explains itself; the flag rides on `CardView`, so the presenter's per-card signature redraws only the cards whose flag flipped (`src/app/presenter.ts:33-35`); cost if wrong: one quiet line per unplaced card.

### New text

(R13) Ruling: the look is `PdfLook = 'changes' | 'new'`, default `'changes'`, kept by `BackupStore.pdfLook()` and `setPdfLook()` under `gloss-review-pdf-look:<token>` through the same `preference()` helper as the view; why: your "kept per browser like the existing view preference (token-keyed)", and the helper is that preference's code (`browser-store.ts:21-30`, `:46-50`); its legacy migration finds no old key and returns null; cost if wrong: none.

(R14) Ruling: the switch is a second button group, `gr-pdf-look`, `role="group"` and `aria-label="PDF shows"`, with "Changes" and "New text" and `aria-pressed`, in the header island next to the view group, shown only while the view is PDF or Both; `HeadView` gains `pdfLook`; the session gains `setPdfLook`, which stores the look and calls a new `PdfPort.setLook`; changing the look redraws the drawn pages and places nothing again; why: the view switch is that bar (`head.tsx:10-12`), the islands rule puts the header in Preact (`CLAUDE.md`, Islands), and positions do not depend on the look; cost if wrong: one header group more on narrow screens.

(R15) Ruling: in "New text" each struck rectangle is covered by a box of the page's background colour, sampled from the page canvas in a one-pixel ring just outside the rectangle, scaled by the canvas's pixel ratio (`pdf-view.ts:97-101`), the most frequent colour of the ring after rounding each channel to a multiple of 8; white when the canvas is missing or `getImageData` throws; why: the canvas is drawn by pdf.js from the same-origin PDF, so it is readable, and a ring outside the glyphs sees paper and not ink; white is the page's own background (`css/review.css:35`); the choosing is a pure function of the pixels, so it is tested without a canvas; cost if wrong: on a tinted or patterned background the cover shows as a patch.

(R16) Ruling: the new words are laid out by a pure `fitWords(words, slots, measure)` in `src/domain/pdf/fit-words.ts`: the slots are the covered rectangles of the item in reading order, each at its own height as font size, never smaller; words fill slot after slot while they fit by `measure`, and the words left go into one callout at the end of the last slot, drawn like R9's label but in the proposal highlight; a pure insertion has no slot, so all its words go into the callout at its caret; the adapter's `measure` is a canvas 2D context's `measureText` with the text div's font family; why: your "No reflow ... same size ... overflow in a small callout at that spot, never shrinking text below legibility"; a text layer line box is its font size (`css/review.css:39`, `line-height: 1`); injecting `measure` keeps the layout testable in Node; cost if wrong: drawn words are in the browser's face for the PDF font's family, not the embedded font, so they read as inserted.

(R17) Ruling: the drawn new words carry the editor's proposal highlight, a 2 px `#2e9d4f` underline on `rgba(46, 157, 79, 0.14)` (`css/review.css:43`), in both themes; a pure deletion is covered with nothing drawn over it; why: SAME-1, one look for one meaning; the page is white in both themes; your "deleted words covered by the page's background"; cost if wrong: a deletion leaves no trace on the page in this mode, its card still listing it (the question at the end).

(R18) Ruling: "Changes" is releasable without any "New text" task, and the cut line in "Order and lanes" is the only one between the two; the "New text" tasks add to the port and the store and never change a "Changes" behaviour; why: your "Changes ships first" if both cannot be safe; cost if wrong: none.

## Layers and interfaces

```ts
// src/domain/pdf/match.ts (task A1; the bodies of today's nearest and emit)
export type SourceKey = Key<number> & { file: string; text: string }
export type PdfKey = Key<PdfPoint>
export function nearestKey(key: string, needle: string, fraction: number): { start: number; end: number } | null
export function segments(pk: PdfKey, id: string, start: number, end: number): PdfPlacement[]

// src/domain/pdf/proposal-marks.ts (task A1)
export type PdfCaret = { id: string; page: number; item: number; offset: number; edge: 'after' | 'before' }
export type Rung = 'both' | 'before' | 'after' | 'alone'
export type ItemPlace = { struck: PdfPlacement[]; caret: PdfCaret | null; rung: Rung }
export function placeItem(sk: SourceKey, pk: PdfKey, item: { id: string; from: number; to: number; inserts: boolean }, fraction: number): ItemPlace | null

// src/app/ports.ts (task A2; setLook in task N3)
export type PdfMark = (PdfPlacement & { look: 'note' | 'struck' }) | (PdfCaret & { look: 'insert'; words: string; deleted: string })
export type PdfLook = 'changes' | 'new'
interface PdfPort { setMarks(marks: readonly PdfMark[]): void; setLook?(look: PdfLook): void /* the rest unchanged */ }
interface BackupStore { pdfLook(): PdfLook | null; setPdfLook(look: PdfLook): void /* task N3 */ }

// src/domain/source/latex-ops.ts (task C1)
export function latexOps(src: string): Op[]

// src/domain/pdf/fit-words.ts (task N1)
export type Slot = { width: number; size: number }
export function fitWords(words: string, slots: readonly Slot[], measure: (text: string, size: number) => number): { lines: string[]; overflow: string }

// src/adapters/pdfjs/background.ts (task N2)
export function backgroundOf(ring: Uint8ClampedArray): string   // '#rrggbb'
export function sampleBackground(canvas: HTMLCanvasElement | undefined, rect: { left: number; top: number; width: number; height: number }, ratio: number): string
```

`mark-draw.ts` (task A3) exports `drawPageMarks(page, marks, look)` for `pdf-view.ts`; `new-text-draw.ts` (task N4) exports the "New text" branch it calls.
Domain files stay pure (`CLAUDE.md`, Layers and purity); `fit-words.ts` gets its measuring as a parameter.

## Acceptance tests

- **A1, placing.** Unit tests on the Typst fixture's strings and on synthetic LaTeX strings: deletion, insertion, replacement, a span across a line break, a heading (`= Heading`, `\section{}` beside a section number), a span across `\textbf{}` (with task C1), a cross-page span split into two segments, and a needle placed by each rung; a word with a nearer wrong occurrence placed right by its context.
- **A2, timing.** 2,000 proposals on the 10,000-line seeded draft, 50 lines a page: the first pass under a bound set from five calibration runs at three times the worst (as `test/domain/review/edit-timing.test.ts:7-10`), each sample logged.
- **A3, the windowed search.** Over 2,000 seeded needles and fractions on the long key, `nearestKey` equals today's `nearest`.
- **A4, the session.** A proposal edited in the editor reaches `setMarks` as struck marks and a caret after 400 ms in the PDF view, never in the editor view; an unchanged item is not placed again; an item with no place keeps its card with "Not shown on the PDF." (task C2).
- **A5, drawing.** In jsdom with faked rectangles: struck lines, carets beside a character, labels truncated at 40 characters, marks only on their page, `scrollToMark` reaching a caret.
- **A6, New text.** `fitWords`: words that fit, a word that fits no slot, overflow to the callout, no size below the slot's; `backgroundOf`: white paper, a tinted page, ink in the ring outvoted; the white fallback with no canvas; the look stored per token and restored; the switch shown only in PDF and Both; a look change redraws without placing.
- **A7, the pictures.** The hand checks below, light and dark, both looks.

## Tasks

Commands, from the clone's root; `job <name> -- <command>` below stands for the two lines

```bash
HEAVY_MODE=none /home/kiibou/work/tools/heavy-job.sh start /tmp/gloss-jobs <name> -- <command>
/home/kiibou/work/tools/heavy-job.sh wait /tmp/gloss-jobs <name>
```

repeated until the wait reports an exit, whose code is read (`CLAUDE.md:26-35`).
Focused tests: `job unit -- npm test -- --maxWorkers=2 <files>`.
Every task ends with `job check -- npm run check -- -- --maxWorkers=2` (build, typecheck, structure, tests) passing, the bundle rebuilt and committed when `src/` or `css/` changed (`CLAUDE.md:40`), and a commit with explicit paths.
A task marked UI ends with its hand checks, both pictures of each looked at, and what each shows named in the commit.

### "Changes"

#### Task A1: placing an item, in the domain (lane D, first; Codex)

**Files:** `src/domain/pdf/match.ts`, `src/domain/pdf/proposal-marks.ts` (new), `test/domain/pdf/proposal-marks.test.ts` (new), `test/domain/pdf/match.test.ts`.
**Interfaces:** `nearestKey`, `segments`, `placeItem`, and the exported key types (Layers and interfaces); `placeMarks` and `toSource` keep their signatures and answers, rebuilt on `nearestKey` and `segments`.

- [ ] Write the tests: R6's struck segments and caret for a deletion, an insertion after a word, an insertion at the very start, a replacement, a "(line break)" proposal, a span across a paragraph break, a heading next to a number the PDF prints and the source lacks (`pdfKey([['1 Observations', ...]])`), a cross-page span split into two segments, each rung reached once (A1), a context-placed word with a nearer wrong occurrence, an empty insertion with no context found returning null, and surrogate pairs and a ligature as `match.test.ts` already does; run `job unit -- npm test -- --maxWorkers=2 test/domain/pdf`; expect FAIL on the missing module.
- [ ] Factor `nearestKey` and `segments` out of `match.ts`, write `placeItem` (R1 to R3, R6); run the same; expect PASS, the existing match tests unchanged and passing.
- [ ] Commit.

#### Task A2: the port and the session (lane D, after A1; Codex)

**Files:** `src/app/ports.ts`, `src/app/pdf-marks.ts`, `src/adapters/pdfjs/pdf-view.ts` (type only: draw `note` and `struck` as today's highlight, skip `insert`, until A3), `test/app/pdf-marks.test.ts`, `test/app/fakes.ts`, `test/adapters/pdfjs/pdf-view.test.ts` (its `placement()` helper gains `look: 'note'`).
**Interfaces:** `PdfMark`, `PdfPort.setMarks(marks)` (R7); `PdfMarks` reads `s.source` and the PDF key, places comments as `note` and proposals as `struck` plus `insert` with `words: brief(proposal)` and `deleted: brief(exact)` (`src/app/brief.ts`), and stops importing `shown` (R5).

- [ ] Write the tests: after a replacement, an insertion, and a deletion in the fake draft (`fakes.ts`: draft 'alpha beta gamma delta', `show` answering `[['alpha beta gamma delta']]`), `setMarks` after 400 ms gets the struck marks and carets of R6 with their words; a comment gets a `note`; the editor view gets nothing; an unchanged item is not placed again (the cache, `pdf-marks.ts:44-46`); run `job unit -- npm test -- --maxWorkers=2 test/app/pdf-marks.test.ts`; expect FAIL.
- [ ] Change the port and `PdfMarks`; run the app tests and `test/adapters/pdfjs/pdf-view.test.ts`; expect PASS.
- [ ] Commit.

#### Task A3: drawing struck words and carets (lane U, after A2; Codex; UI by its tests, pictures in A4)

**Files:** `src/adapters/pdfjs/mark-draw.ts` (new), `src/adapters/pdfjs/pdf-view.ts`, `css/review.css`, `test/adapters/pdfjs/mark-draw.test.ts` (new), `test/adapters/pdfjs/pdf-view.test.ts`, `js/gloss-review.js` and the built CSS.
**Interfaces:** `drawPageMarks(page, marks)` (R7); classes `gr-pdf-mark` plus `gr-pdf-note`, `gr-pdf-struck`, or `gr-pdf-caret` with a child `gr-pdf-label`; `pdf-view.ts` shrinks below its 240-line baseline, and the task lowers that entry in `test/structure/size.test.ts:8` to the new count, or removes it at 150 lines or fewer.

- [ ] Write the tests with `getClientRects` faked as `pdf-view.test.ts:70` does: a struck line per rectangle across two items; a caret from the rectangle of the character before (`after`) and after (`before`) the point (R8); a 41-character label cut to 40 with an ellipsis; "(line break)"; marks only on their own page with the page box read once per page; `scrollToMark` reaching a caret; run `job unit -- npm test -- --maxWorkers=2 test/adapters/pdfjs`; expect FAIL.
- [ ] Write `mark-draw.ts`, move the yellow highlight to `.gr-pdf-note` and add R9's rules to `css/review.css`; run the tests; expect PASS; `job build -- npm run build`.
- [ ] Commit.

#### Task A4: the Typst pictures (lane U, after A3; Codex may render; UI)

**Files:** `scripts/shots/scenes.mjs`.
**Interfaces:** scene `pdf-proposals`: the `editor` scene's three proposals (`scenes.mjs:41-67`) plus "Observations" replaced by "Notes" and a word inserted after "fountain.", then the PDF view; it expects `.gr-pdf-struck` over "grow", "drift", and "Observations", and `.gr-pdf-label` holding "flourish", "softly", and "Notes"; the `both` scene (`:229-233`) gains the same mark checks.

- [ ] Write the scene and its checks; run `job shots -- node scripts/shots.mjs pdf-proposals` on `scripts/dev-nc.sh up` before the drawing is on the instance (A3's bundle not synced, `GLOSS_SHOTS_SKIP_SYNC=1`); expect FAIL on `.gr-pdf-struck`.
- [ ] Run it synced, then `--browser firefox` and `--browser webkit`, and the same three for `both`; expect PASS; look at all twelve pictures (H1, H2).
- [ ] Commit, naming what each picture shows.

#### Task A5: the LaTeX fixture and its pictures (lane U, after A4; Codex may render; UI)

**Files:** `test/fixtures/nc/Latex/{paper.tex,paper.pdf,.gloss-review}` (new; the marker `{}` like `Review/.gloss-review`), `scripts/dev-nc.sh` (`:79`, `:173-175`), `test/scripts/dev-nc.test.mjs` where it lists the shared folders, `scripts/shots/scenes.mjs`.
**Interfaces:** the fixture is synthetic, one A5 page with a numbered `\section` and `\subsection`, `\emph`, `\textbf`, a `%` comment, and a paragraph that wraps (P2's page is a template, its words invented); the PDF is built by `pdflatex -interaction=batchmode paper.tex` and committed with the command in the commit message; scene `latex-proposals` (folder `Latex`): a deletion inside `\emph{}`, a replacement inside `\textbf{}`, a replacement across the wrapped line, a heading replacement, and a pure insertion, then the PDF view, then Both with `capture('-both')`.

- [ ] Write the `dev-nc` test change for the fourth folder; run `job unit -- npm test -- --maxWorkers=2 test/scripts/dev-nc.test.mjs`; expect FAIL; change `dev-nc.sh`; expect PASS.
- [ ] Write the fixture and the scene; `scripts/dev-nc.sh reset`, then run the scene in all three browsers; expect PASS for the single-word cases; the span across `\textbf{}` is checked only after task C1, so the scene checks it behind a flag C1 removes; look at the pictures (H3).
- [ ] Commit.

#### Task B1: the windowed search and the timing test (lane D, after A1; parallel with A2 to A5; Codex)

**Files:** `src/domain/pdf/match.ts`, `test/domain/pdf/match.test.ts`, `test/domain/pdf/proposal-timing.test.ts` (new).
**Interfaces:** `nearestKey` unchanged in signature (R4).

- [ ] Write A3's property test against a copy of today's `nearest` kept in the test file, and A2's timing test with the bound left at 1 ms; run `job unit -- npm test -- --maxWorkers=2 test/domain/pdf`; expect PASS for the property and FAIL for the timing.
- [ ] Write the window; run the timing test five times, log each worst, and set the bound to three times the worst of the five, the samples in a comment as `edit-timing.test.ts:7-10` has them; run; expect PASS.
- [ ] Commit.

#### Task C1: LaTeX ops (lane D, after A1; parallel with B1; Codex)

**Files:** `src/domain/source/latex-ops.ts` (new), `test/domain/source/latex-ops.test.ts` (new), `src/app/lifecycle.ts:22`, `test/app/lifecycle.test.ts`, `test/domain/pdf/proposal-marks.test.ts`, `scripts/shots/scenes.mjs` (the flag of A5 removed).
**Interfaces:** `latexOps(src): Op[]` (R11).

- [ ] Port gloss's cases for these rules into the test with the source named, and add the preamble, a `%` comment, `\label{}` and `\cite{}` arguments dropped, `\emph{word}` keeping "word", an escaped `\%` kept, and a `toSource` selection across `\textbf{}` placing (B7); run `job unit -- npm test -- --maxWorkers=2 test/domain/source/latex-ops.test.ts test/app/lifecycle.test.ts`; expect FAIL.
- [ ] Port the code, switch `lifecycle.ts:22` to `latexOps` for `latex`; run; expect PASS; run `latex-proposals` in Chromium; expect the span across `\textbf{}` struck; look at both pictures.
- [ ] Commit.

#### Task C2: "Not shown on the PDF." (lane U, after A2; beside A3 to A5 on separate files except `css/review.css`; Codex; UI)

**Files:** `src/app/view.ts` (`CardView.offPdf`), `src/app/session-state.ts`, `src/app/pdf-marks.ts`, `src/app/presenter.ts`, `src/ui/card.tsx`, `css/review.css` (one rule, `.gr-off-pdf` like `.gr-count`), `test/app/pdf-marks.test.ts`, `test/app/presenter.test.ts`, `test/ui/islands.test.ts`.
**Interfaces:** after a pass, `PdfMarks` keeps the ids with no mark in `s.offPdf` and calls `render()` only when that set changed; `CardView.offPdf` is `s.view !== 'editor' && s.offPdf.has(id)` (R12).

- [ ] Write the tests: a comment whose words are not in the fake PDF's text gets the line after 400 ms in the PDF view and loses it in the editor view; only that card is upserted; the card renders the line; run `job unit -- npm test -- --maxWorkers=2 test/app/pdf-marks.test.ts test/app/presenter.test.ts test/ui/islands.test.ts`; expect FAIL.
- [ ] Write it; run; expect PASS; run `node scripts/shots.mjs unplaced` through `job` and look at both pictures.
- [ ] Commit.

### Cut line: everything above ships as 0.1.1 alone; everything below ships only if it is merged and its hand checks pass by the checkpoint

### "New text"

#### Task N1: fitting the new words (lane D, after A1; Codex)

**Files:** `src/domain/pdf/fit-words.ts` (new), `test/domain/pdf/fit-words.test.ts` (new).
**Interfaces:** `fitWords` (R16).

- [ ] Write the tests with a fixed-width `measure`: words that fit one slot; words spread over two slots of different sizes, each at its own size; a word wider than every slot going to the overflow; no slot at all (an insertion); whitespace collapsed; the result's sizes never below the slot's; run `job unit -- npm test -- --maxWorkers=2 test/domain/pdf/fit-words.test.ts`; expect FAIL.
- [ ] Write it; run; expect PASS; commit.

#### Task N2: the page's background (lane U, after A3; parallel with N1; Codex)

**Files:** `src/adapters/pdfjs/background.ts` (new), `test/adapters/pdfjs/background.test.ts` (new).
**Interfaces:** `backgroundOf`, `sampleBackground` (R15).

- [ ] Write the tests: a white ring gives `#ffffff`; a ring of `#f4ecd8` with a few black pixels gives `#f0e8d8` (rounded to multiples of 8) and not black; a missing canvas and a `getContext` returning null (jsdom's own) give `#ffffff`; the ring read at the canvas's pixel ratio (a fake context recording its `getImageData` arguments); run `job unit -- npm test -- --maxWorkers=2 test/adapters/pdfjs/background.test.ts`; expect FAIL.
- [ ] Write it; run; expect PASS; commit.

#### Task N3: the look, its preference, and the switch (lane U, after A2; parallel with N1 and N2; Codex; UI by its tests)

**Files:** `src/app/ports.ts`, `src/app/view.ts` (`HeadView.pdfLook`), `src/app/session.ts`, `src/app/session-state.ts`, `src/app/pdf-marks.ts`, `src/app/presenter.ts`, `src/adapters/storage/browser-store.ts`, `src/ui/head.tsx`, `src/ui/panel-model.ts` (if `PanelCommands` lists the command), `css/review.css`, `test/adapters/browser-store.test.ts`, `test/app/session.test.ts`, `test/app/fakes.ts`, `test/ui/islands.test.ts`.
**Interfaces:** R13 and R14.

- [ ] Write the tests: `pdfLook()` null on a fresh store, then `'new'` after `setPdfLook('new')`, keyed `gloss-review-pdf-look:<token>`, a garbage value read as null, a throwing `localStorage` tolerated; the session restoring the stored look at start and passing it to `setLook`, defaulting to `'changes'`; `setPdfLook` storing and calling `setLook` without placing again (`setMarks` not called); the switch rendered with "Changes" pressed, hidden in the editor view, and calling `setPdfLook('new')`; run `job unit -- npm test -- --maxWorkers=2 test/adapters/browser-store.test.ts test/app/session.test.ts test/ui/islands.test.ts`; expect FAIL.
- [ ] Write it; run; expect PASS; commit.

#### Task N4: drawing New text (lane U, after N1, N2, and N3; Codex may render; UI)

**Files:** `src/adapters/pdfjs/new-text-draw.ts` (new), `src/adapters/pdfjs/mark-draw.ts`, `src/adapters/pdfjs/pdf-view.ts` (`setLook`), `src/main.ts` (only if the wiring needs the look at start), `css/review.css`, `test/adapters/pdfjs/new-text-draw.test.ts` (new), `scripts/shots/scenes.mjs`.
**Interfaces:** classes `gr-pdf-cover`, `gr-pdf-new`, and `gr-pdf-callout`; R15 to R17.

- [ ] Write the tests with faked rectangles, a fake `measure`, and a fake canvas: a replacement covered in the sampled colour with its words placed in the covered slot at the slot's height; words that do not fit going into one callout at the end of the last slot; a pure insertion drawing only a callout at its caret; a pure deletion covered with nothing over it; comments keeping their highlight; `setLook` redrawing the drawn pages; run `job unit -- npm test -- --maxWorkers=2 test/adapters/pdfjs`; expect FAIL.
- [ ] Write it; run; expect PASS; build.
- [ ] Extend `pdf-proposals`, `both`, and `latex-proposals`: after the Changes pictures, click "New text", `capture('-new')`, reload, and expect "New text" still pressed; run each in all three browsers; look at every picture (H4, H5).
- [ ] Commit, naming what each picture shows.

### Release

#### Task L: the live check (session, not Codex; after the last merged task)

**Files:** `docs/live-check-results.md`, `docs/live-check.md` (the new scenes).

- [ ] On `scripts/dev-nc.sh reset` with the branch synced, run through `job`, one scene at a time (`docs/live-check.md:20-22`): `pdf-proposals`, `both`, and `latex-proposals` in Chromium, Firefox, and WebKit, and `editor`, `pdf`, `unplaced`, and `long` in Chromium; each light and dark, and with N4 merged both looks.
- [ ] Look at every picture; record in `docs/live-check-results.md` what each shows, and every failure with its fix task; a fix is test-first in the task it belongs to, and this task runs again.
- [ ] Commit.

#### Task R: release 0.1.1 (session, not Codex; last)

**Files:** `appinfo/info.xml:8` (`<version>0.1.1</version>`), `test/structure/package.test.ts:72`, `docs/live-check-results.md`.

- [ ] Change the test's expected version to `0.1.1`; run `job unit -- npm test -- --maxWorkers=2 test/structure/package.test.ts`; expect FAIL; bump `info.xml`; run; expect PASS; commit both.
- [ ] Run `scripts/package.sh` through `job`; then `GLOSS_DEV_NC_COPY=1 scripts/dev-nc.sh reset`, `scripts/dev-nc.sh install-archive <archive>`, `scripts/dev-nc.sh debug false`, and `scripts/dev-nc.sh archive-probe`, and compare the checksums as `docs/live-check.md:9-12` says.
- [ ] With `GLOSS_SHOTS_SKIP_SYNC=1`, run `pdf-proposals` and `latex-proposals` in Chromium on the archive, light and dark, both looks if N4 shipped; look; record in `docs/live-check-results.md`; commit; tell the coordinator the archive's path for your signing.

## Order and lanes

| Lane | Tasks, in order | Starts |
| --- | --- | --- |
| D, domain and app | A1, then A2, B1, C1, and N1 (A2 first if one slot) | at once |
| U, adapter and pictures | A3 after A2, A4, A5; C2 after A2; N2 after A3; N3 after A2; N4 after N1, N2, and N3 | after A2 |
| Release | L, then R | after the last merged task |

At most two task sessions run at once; the critical path for "Changes" is A1, A2, A3, A4, A5, L, R.
**Checkpoint, Tuesday 2026-11-17 at 14:00:** A1 to A5 and B1 merged on `pdf-proposals`; if not, C2 is cut first and then C1, each leaving LaTeX words placed by the one-sided rungs (P2) and off-PDF items without their line.
**Cut line, Tuesday 2026-11-17 at 17:00:** if N1 to N4 are not all merged with H4 and H5 looked at, the "New text" tasks leave the release unmerged, `pdf-proposals` goes to task L with "Changes" only, and "New text" continues for the next release on its own branch.
READY is `pdf-proposals` after task R, on Tuesday evening.

## Hand checks

Each runs on `scripts/dev-nc.sh up` (or `reset` after a route or fixture change) with `node scripts/shots.mjs <scene>` through `job`, which writes the light and the dark picture; the builder looks at both and names in the commit what each shows.

- **H1, Typst in the PDF view.** `pdf-proposals`: "grow", "drift", and "Observations" struck legibly in red on the white page, carets with "flourish", "softly", and "Notes" beside the right words, the comment's yellow highlight on "stones" unchanged; in Chromium, Firefox, and WebKit.
- **H2, Both.** `both`: the same marks beside the editor and the panel at 1,600 by 1,000 pixels; in the three browsers.
- **H3, LaTeX.** `latex-proposals`: the deletion inside `\emph{}`, the replacement inside `\textbf{}`, the heading next to its number, the replacement across the wrapped line struck on both lines, and the insertion's caret; PDF and Both; in the three browsers.
- **H4, New text.** The same three scenes after "New text": old words gone into the page's background with no visible patch, new words over the spot in the highlight at the line's size, the overflow callout where the new words are longer, the insertion as a callout, the comment's highlight unchanged.
- **H5, the look kept.** After a reload "New text" is still pressed, and in the editor view the switch is hidden.
- **H6, regression.** `editor`, `pdf`, `unplaced`, and `long` as in the last live check (`docs/live-check-results.md`).

## Not in this plan

- Compiling the edited source in the browser (PDFP-1 option A, deferred, `docs/decisions.md:122`).
- Reflowing the page for longer new words; your addendum rules it out.
- Moving labels or callouts apart when they overlap on one line (R9's cost).
- Markdown drafts with a PDF beyond today's `plainOps` matching.
- The embedded PDF font for drawn words (R16's cost).

## Question for you

**PDFNT-1 · Deletions in New text**

Question: in "New text", what should a pure deletion leave on the page?

- A: nothing; the words vanish into the background, so the page reads exactly as the proposed version, and the card is the only trace.
- B: a thin green hairline where the words were, so you can still see on the page that something was taken out, at the cost of the page not reading quite clean.

Recommendation: A, as the plan has it (R17), since it is what you described; B is one CSS rule if you want it.
