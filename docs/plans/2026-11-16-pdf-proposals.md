# gloss for Nextcloud, proposals drawn on the PDF: implementation plan

> **For agentic workers:** build task by task, test-first; steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a reviewer sees their own proposals on the uploaded PDF, which stays unchanged: in "Changes" (the default) deleted words are struck through in place and inserted words sit in a small mark at that spot; in "New text" deleted words are covered by the page's background and the new words are drawn over that spot with the proposal highlight, overflow going into a small callout; for Typst and LaTeX alike, with no compiling in the browser.
**Status:** revised after plan review 1 (`~/.cache/gloss-work/pdfprop/plan-review-1.md`), for its recheck.
**Request:** the coordinator's brief of 2026-11-16 for decision PDFP-1 = B (`docs/decisions.md:114-122`), and your addendum of 2026-11-16 at 10:46 as the coordinator relayed it: a two-way switch in the PDF view's bar, "Changes" (default) and "New text"; "No reflow: where the new words need more room than the old ones occupied, draw them at the same size and put the overflow in a small callout at that spot, never shrinking text below legibility"; the choice "kept per browser like the existing view preference (token-keyed)"; the live check covering both modes, light and dark; "Changes" tasks first and releasable alone, "New text" in separate tasks with their own tests, and a marked cut line.
**Base:** branch `pdf-proposals` at `3c22085` ("Record PDFP-1: proposals drawn on the PDF"); every handle below holds there unless it names another repository.
**Branches:** "Changes" builds on `pdf-proposals`; "New text" builds on `pdf-proposals-new`, cut from `pdf-proposals` once A3 is merged, and merged into `pdf-proposals` once, after the "Changes" live check (R18).
**Deadline:** READY on Tuesday 2026-11-17 in the evening; release 0.1.1 on Wednesday 2026-11-18 (`docs/decisions.md:121`); no task touches a signing key.
**Build:** test-first, each new test seen red before its code; builds dispatched before 16:11 on Monday go to Sonnet builders and later ones to Codex at medium effort, so each task names the builder it suits; the pictures of a UI task are looked at by the session that drives it; lanes, file clashes, the checkpoint, and the cut line are in "Order and lanes".
**Review:** one plan review and its recheck; the build's first review from the correctness angle.

## What exists today

- **Matching.** `src/domain/pdf/match.ts` keys both sides on NFKC lower-cased letters and digits (`keyOf`, `:9-22`): `sourceKey` maps each key character to its source offset (`:24-36`), `pdfKey` to `{page, item, offset, endOffset}` (`:39-55`); `nearest` keys its needle on every call and picks the occurrence nearest the item's fraction of the draft, the first on a tie (`:57-66`); `placeMarks` turns a hit into one `PdfPlacement` per page (`:76-107`, the per-page emit at `:95-104`).
- **Ops.** Typst drafts get `parseTypst`, every other language `plainOps` (`src/app/lifecycle.ts:22`), which takes every source character (`src/domain/source/typst-parse.ts:8-12`), so a LaTeX key holds command names such as `textbf` and `section`; the ops feed only `sourceKey` (`lifecycle.ts:23`, used by PDF selections at `src/app/session.ts:60`) and `shown` (`src/app/pdf-marks.ts:49`).
- **The PDF pass.** `PdfMarks.deferPdf` builds a signature of every item per render (`pdf-marks.ts:34`), reschedules a 400 ms timer (`:38`), re-places only items whose `[from, quote, proposal]` changed (`:44-50`) by `shown` plus `placeMarks` on the item's draft words, and calls `pdf.setMarks` only on a change (`:53`); every item, proposal or comment, gets the same yellow highlight over its old words (`css/review.css:38`).
  A pure insertion (empty `quote.exact`) gets no mark, since `nearest` returns null for an empty needle (`match.ts:60`).
- **The adapter.** `drawMarks` (`src/adapters/pdfjs/pdf-view.ts:31-65`) loops over every placement for every page and calls `findIndex` per placement (`:38`), reads the page box's rectangle inside the inner loop (`:50`), and draws one `div.gr-pdf-mark` per client rectangle of a DOM range on the text layer, positioned from the page box's border edge (`:58`) although the marks layer is placed inside the page's 1 px border (`css/review.css:35`, `:37`); marks are redrawn after a page's text layer renders (`:122`) and on every `setMarks` (`:218-221`); the file is at its size baseline of 240 lines (`test/structure/size.test.ts:8`).
  The page is white in both themes (`css/review.css:35`), and the marks layer takes no pointer events (`:37`).
- **Items that cannot be placed.** Saved items that no longer match the draft go to the "Could not place" section (`src/app/items.ts:13-16`, `src/ui/unplaced.tsx`); an item placed in the draft but not on the PDF keeps its card and simply has no mark, and a click on its card scrolls the editor and finds no mark to scroll to (`items.ts:50-53`, `pdf-view.ts:222-228`).
- **The card's words.** `ProposalWords` shows the old words struck, an arrow, and the new words, and "(line break)" only when both are empty after `brief` (`src/ui/proposal-words.tsx:1-8`, `src/app/brief.ts:1`).
- **The view preference.** `createBrowserStore(shareToken)` keeps the view in `localStorage` under `gloss-review-view:<token>`, reading through `preference()`, which migrates a legacy path-keyed value once (`src/adapters/storage/browser-store.ts:21-30`, `:46-50`); `ViewMode` lives in `src/app/view.ts:2`, which `ports.ts` imports (`src/app/ports.ts:3`); the switch is the `gr-views` group in the header island (`src/ui/head.tsx:10-12`).
- **Pictures.** `scripts/shots/scenes.mjs` has `editor` (replace "grow" by "flourish", insert " softly" after "sing", delete "drift", comment on "stones"; `:41-67`), `pdf` (`:91-97`), and `both` (`:229-233`), on the Typst fixture `test/fixtures/nc/Review/`; there is no LaTeX fixture, and `scripts/dev-nc.sh` copies and shares only `Review`, `Plain`, and `Long` (`:79`, `:173-175`); in its default mode the instance serves the repository itself, so a rebuilt bundle is live at once (`scripts/dev-nc.sh:102-112`).

## Probes

On this laptop, Node 26.8.1, synthetic text only; the scripts are in `~/.cache/gloss-work/pdfprop-probes/` (`place.mjs`, `ladder.mjs`, `ladder2.mjs` with `portops.mjs`, `sig.mjs`); the ladders read PDFs with gloss's `pdfjs-dist` 6.3.289 legacy build, where the app bundles 6.5.438, and only `getTextContent` strings are used.
Plan review 1 reproduced P1 and P3 and ran its own probe `drift.mjs` for M2 and M5 below.

- **P1, placing 2,000 items on the 10,000-line draft.** `place.mjs` on `longDraft()` (`scripts/make-long-draft.mjs`), its lines laid out 50 to a page (201 pages), 2,000 seeded one-to-three-word items:

  | Path | Time for 2,000 | Right occurrence |
  | --- | --- | --- |
  | today's: `shown` then `placeMarks` | 557 to 575 ms | not checked |
  | key slice, no context, global `nearest` | not timed | 1,476 (524 land on another occurrence) |
  | key slice with 24 key characters each side, global `nearest` | 318 to 322 ms | 2,000 |
  | the same, searched first in a window of ±2,000 key characters around the fraction | 6.2 ms | 2,000 |
  | the same with a running header and a page number on each page (review M2) | 18 to 19 ms, 59 window misses falling back to the whole key | not reported |

  `sourceKey` took 110 to 132 ms and `pdfKey` 140 to 162 ms, once each per page load.
  With a header and page number on each page, 53 items spanning a page break found no place on the first rung (review M5), since the header's words sit inside the span on the PDF.
- **P2, the context ladder on real PDFs.** For each case the needle is tried with both contexts, then before-context only, after-context only, and the words alone.
  - Typst fixture (`ladder.out`): deletion, replacement, insertion, both headings, and a span across a paragraph break all place on the first rung.
  - `tex/paper.tex` (a numbered `\section`, a `\subsection`, `\emph`, `\textbf`, a `%` comment, a paragraph that wraps), with today's `plainOps` (`ladder.out`): every single-word case places, mostly on a one-sided rung, and "towards the \textbf{orchard}" does not place.
  - The same page with R11's port of gloss's rules alone (`ladder2.out`, "strict tex"): every case places, eight of ten on the first rung; "Observations" takes the after rung and "willow." the before rung, beside the "1.1" the PDF prints and the source does not.
  - `tex2/paper.tex` (adds `\label`, `\ref`, `\vspace{1em}`, `\hspace{2mm}`, a figure with `\includegraphics[width=0.2\linewidth]` and `\caption[Short]{}`, `\setlength`, and `\item[Iota]`), built twice with `pdflatex`: the port alone leaves "1em" and "2mm" in the source key, so the span across `\hspace{2mm}` does not place and "recalls", after `\ref{}` and before `\vspace`, places only alone; R11's extension (layout commands' arguments and every command's optional arguments but `\item`'s dropped) places the `\hspace` span on the first rung and "recalls" on the after rung; with both, a span across `\ref{}` does not place, because the PDF prints "1.1" there; the caption's words and the sentence after the floated figure place only alone; "Iota" from `\item[Iota]` places on the first rung.
- **P3, the per-render signature.** `sig.mjs`: the signature of `pdf-marks.ts:34` over 2,000 proposals costs 0.63 ms median and 1.31 ms worst in 20 runs.

## Size limits and the typing path

| Work | Today | After this plan | Ruling |
| --- | --- | --- | --- |
| Per keystroke | signature of every item, 0.63 ms median at 2,000 (P3) | unchanged | R10 |
| First PDF pass, 2,000 items | 557 ms (P1) | 6 ms of search on clean pages, 19 ms with headers and page numbers (P1), timed by a test | R3, R4 |
| Later passes | changed items only | changed items only | R10 |
| Drawing | every placement per page, `findIndex` per placement (O(P²) worst) | marks grouped by page once, each page draws its own | R7 |
| New text background | none | one `getImageData` per drawn page, timed by a test | R15 |
| Marks drawn | pages with a text layer (R36 of the step 0 plan keeps them near the view) | unchanged | R7 |

## Design rulings

### Placing (both modes)

(R1) Ruling: a new pure module `src/domain/pdf/proposal-marks.ts` places one item from its draft offsets, built on `match.ts`, which exports a keyed `nearestKey` (the body of `nearest` without its `keyOf`) and its per-page emit as `segments`; why: `match.ts` already holds the key and the page split the brief names (lodge d-7779qs), and draft offsets are what an item has (`src/domain/review/model.ts`, `from` and `quote.exact`), while the PDF shows the draft and not the applied text; cost if wrong: none for comments, whose needle is the same key slice `shown` gave (R5).

(R2) Ruling: an item's words are the source-key slice `[lower(at, from), lower(at, to))`, found by binary search on `sourceKey`'s `at`, with no re-keying; why: `sk.at` is sorted by construction (`match.ts:24-36`), and the slice equals `keyOf(shown(...))` because `shown` takes the same text ops and `keyOf` drops what `shown` collapses (`src/domain/source/shown.ts:9-30`, confirmed by plan review 1); cost if wrong: none measurable, P1's key-slice rows include the search.

(R3) Ruling: the needle carries 24 key characters of context on each side, and a ladder tries both contexts, then before-context only, then after-context only, then the words alone, the first rung that finds a hit winning; an item whose key slice is empty (an insertion, or old words of punctuation only) skips the last rung; why: P1 shows 524 of 2,000 words alone landing on another occurrence and none with context, and P2 shows the one-sided rungs placing headings next to section numbers and words next to markup; cost if wrong: a word placed by the last rung may sit on a nearby occurrence of the same word, which a hand check would show.

(R4) Ruling: `nearestKey` first searches the slice `[centre − 2,000, centre + 2,000 + needle.length)` of the key, `centre = fraction × key.length` unrounded, keeping the hit with the smallest distance under strict `<` as `nearest` does (`match.ts:57-66`), and falls back to the whole key when that best distance is not strictly less than 2,000; why: P1, 6.2 ms against 318 ms for the same answers; a hit starting outside the slice is at least 2,000 from the centre, so a strictly closer best inside is the global best, the slice's end extended by the needle's length keeps hits starting near its end (review M1), and the first of two equal distances is the earlier start on both paths; cost if wrong: none for answers, which a seeded property test with constructed ties and window-edge cases compares with today's `nearest`.

(R5) Ruling: comments go through the same ladder as proposals and keep their yellow highlight; `PdfMarks` stops calling `shown`; why: one implementation for one job, placing an item's words on the PDF (lodge d-7779qs), and R2 makes the last rung exactly today's search; cost if wrong: a comment near markup lands on a different occurrence than today, only where today's lands on the wrong one (P1).

(R6) Ruling: an item placed gives struck segments when its key slice is non-empty (the words' hit, split per page by `segments`), and a caret when the card would show new words or "(line break)": after the last struck character for a replacement; for an empty key slice after the key character before the point when the hit carried before-context, otherwise before the next key character; the caret's label comes from one function `proposalLabel(original, proposal)` in `src/app/brief.ts`, returning `brief(proposal)`, "(line break)" when both briefs are empty, or null, which `ProposalWords` also uses for its "(line break)" (`src/ui/proposal-words.tsx:6`); why: a caret after the preceding word reads as "add here", the after-context rung has no preceding character in the hit, and one function keeps the card and the page agreeing, so "," replaced by ";" shows ";" on both (review I5, lodge d-7779qs); cost if wrong: a caret at the start of the next line rather than the end of the previous one.

(R7) Ruling: `PdfPort.setMarks` takes one list of `PdfMark`, a union of `PdfPlacement & { look: 'note' | 'struck' }` and `PdfCaret & { look: 'insert'; words: string }`, defined in `src/app/ports.ts`; the drawing moves to a new adapter file `src/adapters/pdfjs/mark-draw.ts`, which groups marks by page once per `setMarks`, and positions every mark from the marks layer's own rectangle, read once per page; every mark keeps the class `gr-pdf-mark` and `data-id`, with a look class added; why: one list keeps `scrollToMark` one lookup by id (`pdf-view.ts:222-228`) and the shots' `.gr-pdf-mark` checks working (`scenes.mjs:95`), `pdf-view.ts` is at its 240-line baseline (`size.test.ts:8`), the per-placement `findIndex` is the O(P²) of "What exists today", and measuring from the page's border box shifts every mark by its 1 px border, invisible under a translucent highlight and a visible sliver beside an opaque cover (review I7); cost if wrong: one union type to narrow in the adapter.

(R8) Ruling: a caret is drawn from the client rectangle of the one character beside it (its right edge for "after", its left for "before"), never from a collapsed range; why: a collapsed range's `getClientRects` is empty in some engines, and the hand checks run Firefox and WebKit (`CLAUDE.md:39`); cost if wrong: none.

(R9) Ruling: the marks keep fixed colours in both themes: struck words a 2 px line through their middle in `#c23b3b`, the caret a 2 px bar and its label in `#2e9d4f` on white with a 1 px border, at 11 px, at most 40 characters with an ellipsis; the marks layer keeps no pointer events, so the label has no hover title and the card holds the full text; why: the page is white in both themes (`css/review.css:35`), these are the editor's light colours (`:43-44`), and pointer events on labels would block selecting the PDF text under them (`:37`, B7 of the step 0 plan); cost if wrong: long inserted sentences are cut on the page, and labels of neighbouring insertions on one line can overlap.

(R10) Ruling: the per-render signature (`pdf-marks.ts:34`) and the 400 ms deferral stay; the first pass is not chunked; why: P3's 0.63 ms median per keystroke at 2,000 items, and R4's 19 ms first pass on pages with headers; `CLAUDE.md:66` asks for the deferral and changed items only, which the cache already does (`pdf-marks.ts:44-46`); cost if wrong: the timing test of task B1 fails, and chunking is added then.

(R11) Ruling: LaTeX drafts get `latexOps` in a new `src/domain/source/latex-ops.ts`, ported from gloss's LaTeX letter scan (`src/features/preview/logic/preview-words.ts:18-60` and `:65-89` at `e9cb47e5f`: `KEY_COMMAND`, `argumentEnd`, `keyArguments`, the escape and `%` rules), returning text ops over the source outside command names, comments, and hidden arguments, with three rules of its own: the preamble before `\begin{document}` dropped, the arguments of the layout commands `usepackage`, `documentclass`, `includegraphics`, `input`, `include`, `bibliography`, `bibliographystyle`, `vspace`, `hspace`, `newcommand`, `renewcommand`, `setlength`, and `addtolength` dropped, and every command's optional arguments dropped except `\item`'s; `LETTER_COMMANDS` is not ported; a comment in the file names the source and commit; why: the scan is the part that already does this job (lodge d-7779qs), ported as R9 of the step 0 plan ported `refind`; P2 shows the port alone failing on `\hspace{2mm}` and the context after `\vspace{1em}`, and the extension placing both, while gloss's scan has no need for them since it searches a selection's words within known lines; `\item[...]` prints its label (P2, "Iota"); ops feed only the key and `shown` (`lifecycle.ts:22-23`), so the editor's text is untouched, and PDF selections in LaTeX (B7) also start matching across markup; cost if wrong: a word spelled with `\ss` or `\o` loses its context rungs, a custom layout command's argument keeps the one-sided rungs, and a span across `\ref{}` stays off the PDF.

(R12) Ruling: an item that is in the draft but finds no place on the PDF keeps its card, which gains the line "Not shown on the PDF." while the PDF or Both view shows; the "Could not place" section stays as it is; why: the brief's "never lost" and "keep that" (`items.ts:13-16`, `unplaced.tsx`), and a card that scrolls to nothing explains itself; the flag rides on `CardView`, so the presenter's per-card signature redraws only the cards whose flag flipped (`src/app/presenter.ts:33-35`); spans across a page break with a running header or page number land here (P1, review M5); cost if wrong: one quiet line per unplaced card.

### New text

(R13) Ruling: the look is `PdfLook = 'changes' | 'new'`, default `'changes'`, defined in `src/app/view.ts` beside `ViewMode` and imported by `ports.ts`, and kept by `BackupStore.pdfLook()` and `setPdfLook()` under `gloss-review-pdf-look:<token>` through the same `preference()` helper as the view; why: your "kept per browser like the existing view preference (token-keyed)", and the helper is that preference's code (`browser-store.ts:21-30`, `:46-50`); its legacy migration finds no old key and returns null; `ports.ts` already imports `view.ts` (`ports.ts:3`), so the type in `ports.ts` would make a cycle, which plan review 1 reproduced with dependency-cruiser (M7); cost if wrong: none.

(R14) Ruling: the switch is a second button group, `gr-pdf-look`, `role="group"` and `aria-label="PDF shows"`, with "Changes" and "New text" and `aria-pressed`, in the header island next to the view group, shown only while the view is PDF or Both; `HeadView` gains `pdfLook`; the session gains `setPdfLook`, which stores the look and calls a new `PdfPort.setLook`; changing the look redraws the drawn pages and places nothing again; the switch exists only on `pdf-proposals-new` until that branch merges (R18); why: the view switch is that bar (`head.tsx:10-12`), the islands rule puts the header in Preact (`CLAUDE.md`, Islands), and positions do not depend on the look; cost if wrong: one header group more on narrow screens.

(R15) Ruling: in "New text" each struck rectangle is covered by a box of the page's background colour, one CSS pixel larger on each side, the colour sampled from the page canvas in a one-pixel ring just outside the rectangle, taken from one `getImageData` of the whole canvas per page draw, at coordinates measured from the canvas's own rectangle and scaled by its pixel ratio (`pdf-view.ts:97-101`), the most frequent colour of the ring after rounding each channel to a multiple of 8; white when the canvas is missing or `getImageData` throws; why: the canvas is drawn by pdf.js from the same-origin PDF, so it is readable, a ring outside the glyphs sees paper and not ink, measuring from the canvas avoids the border shift of R7 (review I7), and one readback per page instead of one per rectangle bounds the cost (review M10); white is the page's own background (`css/review.css:35`); the choosing is a pure function of the pixels, so it is tested without a canvas; cost if wrong: on a tinted or patterned background the cover shows as a patch.

(R16) Ruling: the new words are laid out by a pure `fitWords(words, slots, measure)` in `src/domain/pdf/fit-words.ts`: the slots are the covered rectangles of the item in reading order, each at its own height as font size, never smaller; words fill slot after slot while they fit by `measure`, and the words left go into one callout at the end of the last slot, drawn like R9's label but in the proposal highlight; a pure insertion has no slot, so all its words go into the callout at its caret; the adapter's `measure` is a canvas 2D context's `measureText` with the text div's font family; why: your "No reflow ... same size ... overflow in a small callout at that spot, never shrinking text below legibility"; a text layer line box is its font size (`css/review.css:39`, `line-height: 1`); injecting `measure` keeps the layout testable in Node; cost if wrong: drawn words are in the browser's face for the PDF font's family, not the embedded font, so they read as inserted.

(R17) Ruling: the drawn new words carry the editor's proposal highlight, a 2 px `#2e9d4f` underline on `rgba(46, 157, 79, 0.14)` (`css/review.css:43`), in both themes; a pure deletion is covered with nothing drawn over it; why: SAME-1, one look for one meaning; the page is white in both themes; your "deleted words covered by the page's background"; and the coordinator ruled PDFNT-1 on 2026-11-16: in "New text" a deletion leaves nothing on the page, its card being the trace; cost if wrong: a deletion is visible only in the panel in this mode.

(R18) Ruling: "New text" is built on its own branch `pdf-proposals-new`, cut from `pdf-proposals` once A3 is merged and brought up to date by merging `pdf-proposals` into it, and merged into `pdf-proposals` once, only after N4 is merged on it with H4 and H5 looked at and after task L has passed for "Changes"; until then `pdf-proposals` carries no look, no switch, and no `setLook`; why: the coordinator's ruling that the cut line be real, and plan review 1's scenario of three New text merges interleaved with Changes merges on shared files and the bundle, to be reverted under the deadline (I1); not merging one branch is the whole cut; cost if wrong: one extra merge of `pdf-proposals` into the side branch per Changes merge, each settled by R19's bundle rule.

(R19) Ruling: a conflict in the committed bundle (`js/gloss-review.js` and the built CSS, `CLAUDE.md:40`) is settled by taking either side, running `npm run build`, and committing the rebuilt files; tasks that share a source file run one after the other (the clash table in "Order and lanes"); why: two sessions run at once and every `src/` or `css/` task commits the bundle, which cannot be merged by hand (review I3); cost if wrong: none, CI's rebuild diff check catches a stale bundle.

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

// src/app/brief.ts (task A2)
export function proposalLabel(original: string, proposal: string): string | null

// src/app/ports.ts (task A2; setLook on pdf-proposals-new in task N3)
export type PdfMark = (PdfPlacement & { look: 'note' | 'struck' }) | (PdfCaret & { look: 'insert'; words: string })
interface PdfPort { setMarks(marks: readonly PdfMark[]): void; setLook(look: PdfLook): void /* the rest unchanged */ }
interface BackupStore { pdfLook(): PdfLook | null; setPdfLook(look: PdfLook): void /* task N3 */ }

// src/app/view.ts (task N3)
export type PdfLook = 'changes' | 'new'

// src/domain/source/latex-ops.ts (task C1a)
export function latexOps(src: string): Op[]

// src/domain/pdf/fit-words.ts (task N1)
export type Slot = { width: number; size: number }
export function fitWords(words: string, slots: readonly Slot[], measure: (text: string, size: number) => number): { lines: string[]; overflow: string }

// src/adapters/pdfjs/background.ts (task N2)
export function backgroundOf(ring: Uint8ClampedArray): string   // '#rrggbb'
export function ringOf(image: ImageData | null, rect: { left: number; top: number; width: number; height: number }, ratio: number): Uint8ClampedArray
```

`mark-draw.ts` (task A3) exports `drawPageMarks(page, marks)` for `pdf-view.ts`; task N4 adds a third parameter `look` and a new file `new-text-draw.ts` for the "New text" branch it calls.
Domain files stay pure (`CLAUDE.md`, Layers and purity); `fit-words.ts` gets its measuring as a parameter.

## Acceptance tests

- **A1, placing.** Unit tests on the Typst fixture's strings and on synthetic LaTeX strings: deletion, insertion, replacement, punctuation replaced by punctuation, a span across a line break, a heading (`= Heading`, `\section{}` beside a section number), a span across `\textbf{}` (with task C1a), a cross-page span on clean pages split into two segments, a cross-page span with a page number between the pages returning null, and a needle placed by each rung; a word with a nearer wrong occurrence placed right by its context.
- **A2, timing.** 2,000 proposals on the 10,000-line seeded draft, 50 lines a page, each page with a running header and a page number so the window's fallback is inside the timed pass: the first pass under a bound set from five calibration runs at three times the worst (as `test/domain/review/edit-timing.test.ts:7-10`), each sample logged.
- **A3, the windowed search.** Over 2,000 seeded needles and fractions on the long key, plus constructed cases (two hits at equal distance either side of the centre, a hit starting within one needle length of the window's end, a hit just outside the window), `nearestKey` equals today's `nearest`.
- **A4, the session.** A proposal edited in the editor reaches `setMarks` as struck marks and a caret after 400 ms in the PDF view, never in the editor view; an unchanged item is not placed again; an item with no place keeps its card with "Not shown on the PDF.", which goes when the editor view shows (task C2).
- **A5, drawing.** In jsdom with faked rectangles: struck lines, carets beside a character, labels truncated at 40 characters, marks only on their page, positions measured from the marks layer inside a bordered page box, `scrollToMark` reaching a caret.
- **A6, New text.** `fitWords`: words that fit, a word that fits no slot, overflow to the callout, no size below the slot's; `backgroundOf`: white paper, a tinted page, ink in the ring outvoted; the white fallback with no canvas; one image read per page draw; the look stored per token and restored; the switch shown only in PDF and Both; a look change redraws without placing.
- **A7, the pictures.** The hand checks below, light and dark, both looks, each scene with one proposal that is in the draft but not on the PDF.

## Tasks

Commands, from the clone's root; `job <name> -- <command>` below stands for the two lines

```bash
HEAVY_MODE=none /home/kiibou/work/tools/heavy-job.sh start /tmp/gloss-jobs <name> -- <command>
/home/kiibou/work/tools/heavy-job.sh wait /tmp/gloss-jobs <name>
```

repeated until the wait reports an exit, whose code is read (`CLAUDE.md:26-35`).
Focused tests: `job unit -- npm test -- --maxWorkers=2 <files>`.
Every task ends with `job check -- npm run check -- -- --maxWorkers=2` (build, typecheck, structure, tests) passing, the bundle rebuilt and committed when `src/` or `css/` changed (`CLAUDE.md:40`, R19), and a commit with explicit paths.
A task marked UI ends with its hand checks, both pictures of each looked at, and what each shows named in the commit.
"Builder" names who suits the task: **Sonnet** for the tasks dispatched first (before 16:11 on Monday), **Codex** (medium) for the later ones, and **session** for the live check and the release.

### "Changes", on `pdf-proposals`

#### Task A1: placing an item, in the domain (lane D, first; builder: Sonnet)

**Files:** `src/domain/pdf/match.ts`, `src/domain/pdf/proposal-marks.ts` (new), `test/domain/pdf/proposal-marks.test.ts` (new), `test/domain/pdf/match.test.ts`.
**Interfaces:** `nearestKey`, `segments`, `placeItem`, and the exported key types (Layers and interfaces); `placeMarks` and `toSource` keep their signatures and answers, rebuilt on `nearestKey` and `segments`.

- [ ] Write the tests: R6's struck segments and caret for a deletion, an insertion after a word, an insertion at the very start, a replacement, "," replaced by ";" (no struck segment, a caret), a whitespace-only proposal (a caret), a span across a paragraph break, a heading next to a number the PDF prints and the source lacks (`pdfKey([['1 Observations', ...]])`), a cross-page span on clean pages split into two segments, a cross-page span with a page number between the pages returning null (P1, review M5), each rung reached once (A1), a context-placed word with a nearer wrong occurrence, an empty insertion with no context found returning null, and surrogate pairs and a ligature as `match.test.ts` already does; run `job unit -- npm test -- --maxWorkers=2 test/domain/pdf`; expect FAIL on the missing module.
- [ ] Factor `nearestKey` and `segments` out of `match.ts`, write `placeItem` (R1 to R3, R6); run the same; expect PASS, the existing match tests unchanged and passing.
- [ ] Commit.

#### Task A2: the port and the session (lane D, after A1; builder: Sonnet)

**Files:** `src/app/ports.ts`, `src/app/pdf-marks.ts`, `src/app/brief.ts`, `src/ui/proposal-words.tsx`, `src/adapters/pdfjs/pdf-view.ts` (type only: the existing `placements = next` line becomes a filter dropping `insert` marks, so the file keeps its 240 lines and draws `note` and `struck` as today's highlight until A3), `test/app/pdf-marks.test.ts`, `test/app/fakes.ts`, `test/app/brief.test.ts` (new if absent), `test/ui/islands.test.ts`, `test/adapters/pdfjs/pdf-view.test.ts` (its `placement()` helper gains `look: 'note'`).
**Interfaces:** `PdfMark`, `PdfPort.setMarks(marks)` (R7, without `setLook`, which N3 adds on the side branch); `proposalLabel` (R6); `PdfMarks` reads `s.source` and the PDF key, places comments as `note` and proposals as `struck` plus `insert` with `words: proposalLabel(brief(exact), brief(proposal))`, and stops importing `shown` (R5).

- [ ] Write the tests: `proposalLabel` for new words, for "," to ";", and for whitespace only; `ProposalWords` still shows "(line break)" and ", → ;" through it; after a replacement, an insertion, a deletion, and a punctuation change in the fake draft (`fakes.ts`: draft 'alpha beta gamma delta', `show` answering `[['alpha beta gamma delta']]`), `setMarks` after 400 ms gets the struck marks and carets of R6 with their labels; a comment gets a `note`; the editor view gets nothing; an unchanged item is not placed again (the cache, `pdf-marks.ts:44-46`); run `job unit -- npm test -- --maxWorkers=2 test/app/pdf-marks.test.ts test/app/brief.test.ts test/ui/islands.test.ts`; expect FAIL.
- [ ] Change the port, `brief.ts`, `ProposalWords`, and `PdfMarks`; run the app, island, and `test/adapters/pdfjs/pdf-view.test.ts` tests; expect PASS, `pdf-view.ts` still at 240 lines.
- [ ] Commit.

#### Task C2: "Not shown on the PDF." (lane D, after A2; builder: Sonnet; UI by its tests, pictures in A4)

**Files:** `src/app/view.ts` (`CardView.offPdf`), `src/app/session-state.ts`, `src/app/pdf-marks.ts`, `src/app/presenter.ts`, `src/ui/card.tsx`, `css/review.css` (one rule, `.gr-off-pdf` like `.gr-count`), `test/app/pdf-marks.test.ts`, `test/app/presenter.test.ts`, `test/ui/islands.test.ts`.
**Interfaces:** `PdfMarks`' actions become `Pick<SessionActions, 'head' | 'render'>` (`pdf-marks.ts:15-31`, review M6); after a pass, `PdfMarks` keeps the ids with no mark in `s.offPdf` and calls `render()` only when that set changed, and `setView` calls `render()` so the line goes with the editor view; `CardView.offPdf` is `s.view !== 'editor' && s.offPdf.has(id)` (R12).

- [ ] Write the tests: a comment whose words are not in the fake PDF's text gets the line after 400 ms in the PDF view and loses it on switching to the editor view; only that card is upserted; the card renders the line; run `job unit -- npm test -- --maxWorkers=2 test/app/pdf-marks.test.ts test/app/presenter.test.ts test/ui/islands.test.ts`; expect FAIL.
- [ ] Write it; run; expect PASS.
- [ ] Commit.

#### Task A3: drawing struck words and carets (lane U, after A2; builder: Sonnet; UI by its tests, pictures in A4)

**Files:** `src/adapters/pdfjs/mark-draw.ts` (new), `src/adapters/pdfjs/pdf-view.ts`, `css/review.css`, `test/adapters/pdfjs/mark-draw.test.ts` (new), `test/adapters/pdfjs/pdf-view.test.ts`, `test/structure/size.test.ts`, `js/gloss-review.js` and the built CSS.
**Interfaces:** `drawPageMarks(page, marks)` (R7); classes `gr-pdf-mark` plus `gr-pdf-note`, `gr-pdf-struck`, or `gr-pdf-caret` with a child `gr-pdf-label`; `pdf-view.ts` shrinks below its 240-line baseline, and the task lowers that entry in `test/structure/size.test.ts:8` to the new count, or removes it at 150 lines or fewer.

- [ ] Write the tests with `getClientRects` faked as `pdf-view.test.ts:70` does: a struck line per rectangle across two items; a caret from the rectangle of the character before (`after`) and after (`before`) the point (R8); a 41-character label cut to 40 with an ellipsis; "(line break)"; marks only on their own page with the marks layer's rectangle read once per page; positions measured from the marks layer of a page box with a 1 px border (R7); `scrollToMark` reaching a caret; run `job unit -- npm test -- --maxWorkers=2 test/adapters/pdfjs`; expect FAIL.
- [ ] Write `mark-draw.ts`, move the yellow highlight to `.gr-pdf-note` and add R9's rules to `css/review.css`; run the tests; expect PASS; `job build -- npm run build`.
- [ ] Commit.

#### Task A4: the Typst pictures (lane U, after A3 and C2; builder: Sonnet or Codex, may render; UI)

**Files:** `scripts/shots/scenes.mjs`, `test/fixtures/nc/Review/paper.typ` (one line appended), `test/scripts/scenes.test.mjs` if it pins the scene list or the fixture's text.
**Interfaces:** the fixture gains a last line `// Theta notes stay in the source only.`, a Typst comment that prints nothing, so its words are in the draft and not on the PDF, which stays as it is (`parseTypst` keeps comments as text); scene `pdf-proposals`: the `editor` scene's three proposals (`scenes.mjs:41-67`) plus "Observations" replaced by "Notes", a word inserted after "fountain.", and "Theta" replaced by "Iota" in the comment, then the PDF view; it checks each proposal by joining its card's `data-id` to `.gr-pdf-struck[data-id]` and `.gr-pdf-caret[data-id]`, the labels "flourish", "softly", and "Notes", and for the Theta proposal a visible card with "Not shown on the PDF." and no `.gr-pdf-mark` of its id; the `both` scene (`:229-233`) gains the same checks.

- [ ] Grep `test/` and `scripts/` for tests that pin `Review/paper.typ`'s text (`scripts/shots/page.mjs:12` reads it) and fix any the new line breaks.
- [ ] Write the scene and its checks; because the instance serves the repository (`dev-nc.sh:102-112`), see them fail by restoring the A2 commit's bundle for one run: `git checkout <A2 commit> -- js/gloss-review.js` plus the built CSS, `job shots -- node scripts/shots.mjs pdf-proposals`, expect FAIL on the joins, then `git checkout HEAD -- js/gloss-review.js` plus the built CSS.
- [ ] Run `pdf-proposals` and `both` in Chromium, then with `--browser firefox` and `--browser webkit`; expect PASS; look at all twelve pictures (H1, H2).
- [ ] Commit, naming what each picture shows.

#### Task A5: the LaTeX fixture and its pictures (lane U, after A4; builder: Codex, may render; UI)

**Files:** `test/fixtures/nc/Latex/{paper.tex,paper.pdf,.gloss-review}` (new; the marker `{}` like `Review/.gloss-review`), `scripts/dev-nc.sh` (`:79`, `:173-175`), `test/scripts/dev-nc.test.mjs` where it lists the shared folders, `scripts/shots/scenes.mjs`.
**Interfaces:** the fixture is synthetic, one A5 page with a numbered `\section` with a `\label`, a `\subsection`, `\emph`, `\textbf`, a `%` comment, a `\vspace{1em}`, a `\hspace{2mm}`, a sentence referring to the subsection by `Section~\ref{}`, and a paragraph that wraps (P2's two pages are templates, their words invented); the PDF is built by running `pdflatex -interaction=batchmode paper.tex` twice and committed with the command in the commit message; scene `latex-proposals` (folder `Latex`): a deletion inside `\emph{}`, a replacement inside `\textbf{}`, a replacement across the wrapped line, a heading replacement, a pure insertion, and a replacement spanning `Section~\ref{}`, which is in the draft and not on the PDF (P2), then the PDF view, then Both with `capture('-both')`; the checks join `data-id`s as in A4, and the `\ref` proposal's card shows with no mark of its id.

- [ ] Write the `dev-nc` test change for the fourth folder; run `job unit -- npm test -- --maxWorkers=2 test/scripts/dev-nc.test.mjs`; expect FAIL; change `dev-nc.sh`; expect PASS.
- [ ] Write the fixture and the scene; `scripts/dev-nc.sh reset`, then run the scene in all three browsers; expect PASS for the cases that do not cross markup; the replacement inside `\textbf{}` across the following words and the context beside `\hspace` are checked only after task C1b, so the scene checks them behind a flag C1b removes; look at the pictures (H3).
- [ ] Commit.

#### Task B1: the windowed search and the timing test (lane D, after A1, parallel with A2; builder: Sonnet)

**Files:** `src/domain/pdf/match.ts`, `test/domain/pdf/match.test.ts`, `test/domain/pdf/proposal-timing.test.ts` (new).
**Interfaces:** `nearestKey` unchanged in signature (R4).

- [ ] Write A3's property test against a copy of today's `nearest` kept in the test file, with the constructed tie and window-edge cases, and A2's timing test on pages with a header and a page number, the bound left at 1 ms; run `job unit -- npm test -- --maxWorkers=2 test/domain/pdf`; expect PASS for the property and FAIL for the timing.
- [ ] Write the window; run the timing test five times, log each worst, and set the bound to three times the worst of the five, the samples in a comment as `edit-timing.test.ts:7-10` has them; run; expect PASS.
- [ ] Commit.

#### Task C1a: LaTeX ops (lane D, after C2; builder: Codex)

**Files:** `src/domain/source/latex-ops.ts` (new), `test/domain/source/latex-ops.test.ts` (new), `src/app/lifecycle.ts:22`, `test/app/lifecycle.test.ts`, `test/domain/pdf/proposal-marks.test.ts`.
**Interfaces:** `latexOps(src): Op[]` (R11).

- [ ] Port gloss's cases for these rules into the test with the source named, and add the preamble, a `%` comment, `\label{}` and `\cite{}` arguments dropped, `\vspace{1em}`, `\hspace{2mm}`, `\includegraphics[width=0.2\linewidth]{fig}`, and `\setlength{\parskip}{4pt}` leaving no key characters, `\caption[Short]{Long}` keeping only "Long", `\item[Iota]` keeping "Iota", `\emph{word}` keeping "word", an escaped `\%` kept, a `proposal-marks` case placing a span across `\textbf{}` on the first rung, and a `toSource` selection across `\textbf{}` placing (B7); run `job unit -- npm test -- --maxWorkers=2 test/domain/source/latex-ops.test.ts test/app/lifecycle.test.ts test/domain/pdf/proposal-marks.test.ts`; expect FAIL.
- [ ] Port the code, switch `lifecycle.ts:22` to `latexOps` for `latex`; run; expect PASS.
- [ ] Commit.

#### Task C1b: the LaTeX scene's markup cases (lane U, after A5 and C1a; builder: Codex, may render; UI)

**Files:** `scripts/shots/scenes.mjs` (the flag of A5 removed).

- [ ] Remove the flag; run `latex-proposals` in Chromium; expect PASS with the spans beside markup struck; run Firefox and WebKit; look at the pictures (H3).
- [ ] Commit.

### Cut line: everything above ships as 0.1.1 alone; everything below lives on `pdf-proposals-new` and ships only by R18's one merge

### "New text", on `pdf-proposals-new`

The branch is cut from `pdf-proposals` once A3 is merged; after each later Changes merge, the next New text task starts by merging `pdf-proposals` into the branch (R18, R19).

#### Task N1: fitting the new words (lane D, after B1; builder: Codex)

**Files:** `src/domain/pdf/fit-words.ts` (new), `test/domain/pdf/fit-words.test.ts` (new).
**Interfaces:** `fitWords` (R16).

- [ ] Write the tests with a fixed-width `measure`: words that fit one slot; words spread over two slots of different sizes, each at its own size; a word wider than every slot going to the overflow; no slot at all (an insertion); whitespace collapsed; the result's sizes never below the slot's; run `job unit -- npm test -- --maxWorkers=2 test/domain/pdf/fit-words.test.ts`; expect FAIL.
- [ ] Write it; run; expect PASS; commit.

#### Task N2: the page's background (lane D, after N1; builder: Codex)

**Files:** `src/adapters/pdfjs/background.ts` (new), `test/adapters/pdfjs/background.test.ts` (new).
**Interfaces:** `backgroundOf`, `ringOf` (R15).

- [ ] Write the tests: a white ring gives `#ffffff`; a ring of `#f4ecd8` with a few black pixels gives `#f0e8d8` (rounded to multiples of 8) and not black; a null image gives an empty ring and `backgroundOf` of an empty ring gives `#ffffff`; the ring read at the pixel ratio from a synthetic `ImageData`-shaped object; run `job unit -- npm test -- --maxWorkers=2 test/adapters/pdfjs/background.test.ts`; expect FAIL.
- [ ] Write it; run; expect PASS; commit.

#### Task N3: the look, its preference, and the switch (lane D, after N2; builder: Codex; UI by its tests, pictures in N4)

**Files:** `src/app/ports.ts`, `src/app/view.ts` (`PdfLook`, `HeadView.pdfLook`), `src/app/session.ts`, `src/app/session-state.ts`, `src/app/pdf-marks.ts`, `src/app/presenter.ts`, `src/adapters/storage/browser-store.ts`, `src/adapters/pdfjs/pdf-view.ts` (a `setLook` that stores the look and redraws, no drawing change), `src/ui/head.tsx`, `src/ui/panel-model.ts` (`PanelCommands` is a `Pick` of the session, `:9`), `css/review.css`, `test/adapters/browser-store.test.ts`, `test/app/session.test.ts`, `test/app/fakes.ts`, `test/ui/islands.test.ts`, `test/structure/size.test.ts` if `pdf-view.ts` grows past the count A3 set.
**Interfaces:** R13 and R14; `PdfPort.setLook` required.

- [ ] Write the tests: `pdfLook()` null on a fresh store, then `'new'` after `setPdfLook('new')`, keyed `gloss-review-pdf-look:<token>`, a garbage value read as null, a throwing `localStorage` tolerated; the session restoring the stored look at start and passing it to `setLook`, defaulting to `'changes'`; `setPdfLook` storing and calling `setLook` without placing again (`setMarks` not called); the switch rendered with "Changes" pressed, hidden in the editor view, and calling `setPdfLook('new')`; run `job unit -- npm test -- --maxWorkers=2 test/adapters/browser-store.test.ts test/app/session.test.ts test/ui/islands.test.ts`; expect FAIL.
- [ ] Write it; run; expect PASS, and `npm run structure` reporting no cycle; commit.

#### Task N4: drawing New text (lane U, after N3 and C1b; builder: Codex, may render; UI)

**Files:** `src/adapters/pdfjs/new-text-draw.ts` (new), `src/adapters/pdfjs/mark-draw.ts`, `src/adapters/pdfjs/pdf-view.ts`, `test/structure/size.test.ts`, `css/review.css`, `test/adapters/pdfjs/new-text-draw.test.ts` (new), `test/adapters/pdfjs/mark-draw.test.ts`, `scripts/shots/scenes.mjs`.
**Interfaces:** `drawPageMarks(page, marks, look)`; classes `gr-pdf-cover`, `gr-pdf-new`, and `gr-pdf-callout`; R15 to R17.

- [ ] Write the tests with faked rectangles, a fake `measure`, and a fake canvas: a replacement covered in the sampled colour, one pixel larger each side, with its words placed in the covered slot at the slot's height; words that do not fit going into one callout at the end of the last slot; a pure insertion drawing only a callout at its caret; a pure deletion covered with nothing over it (R17); comments keeping their highlight; one `getImageData` per page draw with 300 struck rectangles on a page, and that page's draw under a bound set as in B1; ring coordinates measured from the canvas's rectangle; `setLook` redrawing the drawn pages; run `job unit -- npm test -- --maxWorkers=2 test/adapters/pdfjs`; expect FAIL.
- [ ] Write it; run; expect PASS; build.
- [ ] Extend `pdf-proposals`, `both`, and `latex-proposals`: after the Changes pictures, click "New text", `capture('-new')`, check the unplaceable proposal's card still shows with no mark, reload, and expect "New text" still pressed; run each in all three browsers; look at every picture (H4, H5).
- [ ] Commit, naming what each picture shows.

### Release, on `pdf-proposals`

#### Task L: the live check (builder: session; after C1b, and again after the New text merge)

**Files:** `docs/live-check-results.md`, `docs/live-check.md` (the new scenes).

- [ ] On `scripts/dev-nc.sh reset` with `pdf-proposals` checked out, run through `job`, one scene at a time (`docs/live-check.md:20-22`): `pdf-proposals`, `both`, and `latex-proposals` in Chromium, Firefox, and WebKit, and `editor`, `pdf`, `unplaced`, and `long` in Chromium; each light and dark.
- [ ] Look at every picture, including each scene's unplaceable proposal (its card shows with "Not shown on the PDF." and no mark); record in `docs/live-check-results.md` what each shows, and every failure with its fix task; a fix is test-first in the task it belongs to, and this task runs again.
- [ ] Commit.
- [ ] If R18 lets `pdf-proposals-new` merge, merge it, settle the bundle by R19, and run the first step again with both looks; look, record, and commit.

#### Task R: release 0.1.1 (builder: session; last)

**Files:** `appinfo/info.xml:8` (`<version>0.1.1</version>`), `test/structure/package.test.ts:72`, `docs/live-check-results.md`.

- [ ] Change the test's expected version to `0.1.1`; run `job unit -- npm test -- --maxWorkers=2 test/structure/package.test.ts`; expect FAIL; bump `info.xml`; run; expect PASS; commit both.
- [ ] Run `scripts/package.sh` through `job`; then `GLOSS_DEV_NC_COPY=1 scripts/dev-nc.sh reset`, `scripts/dev-nc.sh install-archive <archive>`, `scripts/dev-nc.sh debug false`, and `scripts/dev-nc.sh archive-probe`, and compare the checksums as `docs/live-check.md:9-12` says.
- [ ] With `GLOSS_SHOTS_SKIP_SYNC=1`, run `pdf-proposals` and `latex-proposals` in Chromium on the archive, light and dark, both looks if New text merged; look; record in `docs/live-check-results.md`; commit; tell the coordinator the archive's path for your signing.

## Order and lanes

| Lane | Tasks, in order | Branch |
| --- | --- | --- |
| D, domain and app | A1; then A2 and B1 side by side if two slots are free, otherwise A2 first; C2; C1a; then N1, N2, N3 | `pdf-proposals`, then `pdf-proposals-new` from N1 |
| U, adapter and pictures | A3 after A2; A4 after A3 and C2; A5; C1b after C1a; N4 after N3 | `pdf-proposals`, then `pdf-proposals-new` for N4 |
| Release | L after C1b; the New text merge and L again; R | `pdf-proposals` |

At most two task sessions run at once; only lane U and the release use the dev Nextcloud, so no two picture runs share it.
The critical path for "Changes" is A1, A2, A3, A4, A5, C1b, L, R.

File clashes, so tasks sharing a file never run at once:

| Shared file | Tasks | How they are kept apart |
| --- | --- | --- |
| `src/domain/pdf/match.ts`, `test/domain/pdf/match.test.ts` | A1, B1 | B1 starts after A1 is merged |
| `src/adapters/pdfjs/pdf-view.ts`, its test | A2, A3, N3, N4 | A3 after A2; N3 and N4 on the side branch, N4 after N3 |
| `src/app/pdf-marks.ts`, `test/app/pdf-marks.test.ts` | A2, C2, N3 | all in lane D, in that order |
| `src/app/view.ts`, `session-state.ts`, `presenter.ts`, `test/ui/islands.test.ts` | A2 (islands test), C2, N3 | all in lane D, in that order |
| `test/domain/pdf/proposal-marks.test.ts` | A1, C1a | lane D, in that order |
| `scripts/shots/scenes.mjs` | A4, A5, C1b, N4 | all in lane U, in that order |
| `css/review.css` | A3, C2, N3, N4 | A3 (lane U) and C2 (lane D) can overlap: different rules, a text merge; the bundle by R19 |
| `js/gloss-review.js` and the built CSS | every task changing `src/` or `css/` | R19 |
| `test/structure/size.test.ts` | A3, N3, N4 | A3 before the side branch exists; N3 before N4 |

**Checkpoint, Tuesday 2026-11-17 at 14:00:** A1 to A5, B1, and C2 merged on `pdf-proposals`; if not, C1a and C1b are cut, leaving LaTeX words placed by `plainOps` and the one-sided rungs (P2), and task L starts.
**Cut line, Tuesday 2026-11-17 at 17:00:** if N4 is not merged on `pdf-proposals-new` with H4 and H5 looked at, or task L has not passed for "Changes", the side branch is not merged, the release ships "Changes" alone, and "New text" continues on its branch for the next release.
READY is `pdf-proposals` after task R, on Tuesday evening.

## Hand checks

Each runs on `scripts/dev-nc.sh up` (or `reset` after a route or fixture change) with `node scripts/shots.mjs <scene>` through `job`, which writes the light and the dark picture; the builder looks at both and names in the commit what each shows.

- **H1, Typst in the PDF view.** `pdf-proposals`: "grow", "drift", and "Observations" struck legibly in red on the white page, carets with "flourish", "softly", and "Notes" beside the right words, the comment's yellow highlight on "stones" unchanged, the Theta proposal's card showing "Not shown on the PDF."; in Chromium, Firefox, and WebKit.
- **H2, Both.** `both`: the same marks beside the editor and the panel at 1,600 by 1,000 pixels; in the three browsers.
- **H3, LaTeX.** `latex-proposals`: the deletion inside `\emph{}`, the replacement inside `\textbf{}`, the heading next to its number, the replacement across the wrapped line struck on both lines, the insertion's caret, and the `\ref` proposal's card with its line and no mark; PDF and Both; in the three browsers.
- **H4, New text.** The same three scenes after "New text": old words gone into the page's background with no visible patch or sliver of old glyphs, new words over the spot in the highlight at the line's size, the overflow callout where the new words are longer, the insertion as a callout, a deletion leaving nothing, the comment's highlight unchanged, the unplaceable proposals' cards unchanged.
- **H5, the look kept.** After a reload "New text" is still pressed, and in the editor view the switch is hidden.
- **H6, regression.** `editor`, `pdf`, `unplaced`, and `long` as in the last live check (`docs/live-check-results.md`).

## Not in this plan

- Compiling the edited source in the browser (PDFP-1 option A, deferred, `docs/decisions.md:122`).
- Reflowing the page for longer new words; your addendum rules it out.
- Moving labels or callouts apart when they overlap on one line (R9's cost).
- Spans across a page break that carries a header or page number, and spans across `\ref{}`; they stay off the PDF with their card's line (R12).
- Markdown drafts with a PDF beyond today's `plainOps` matching.
- The embedded PDF font for drawn words (R16's cost).

## Question for you

None; the one value question, what a deletion leaves in "New text", was ruled by the coordinator (R17).
