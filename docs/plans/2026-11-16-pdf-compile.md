# gloss for Nextcloud, the Typst draft compiled in the browser: implementation plan

> **For agentic workers:** build task by task, test-first; steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** for a Typst draft, the PDF view shows the reviewer's proposals as a real inline diff ("Changes": the diff source compiled, deletions struck in red, insertions underlined in green) and as the real new version ("New text": the applied source compiled, new words lightly highlighted), with the uploaded PDF still reachable as "Original"; LaTeX and Markdown keep 0.1.1's overlay with three fixes; any Typst draft the browser cannot compile falls back to the overlay with one quiet line; release 0.2.0.
**Status:** revised after its one plan review, whose Important findings I1 to I10 and Minor findings M1 to M10 are folded in; no Critical finding, so no recheck.
**Request:** the coordinator's brief of 2026-11-16 (`~/.cache/gloss-work/pdfdiff/request.md`), on your words "For the changes I'd imagine it to look just like a normal inline diff" and, offered PDFDIFF-1, "Just do it now.."; its rulings 1 to 7 bind, and every refinement below is marked **Refined** with its reason.
**Base:** branches `pdf-compile` and `pdf-overlay`, both from `83222f6` ("Release 0.1.1: reviewers see their proposals on the PDF"); `pdf-overlay` carries tasks O1 and O2 only, and every other task builds on `pdf-compile`; every handle below holds at the base unless it names another repository.
**Deadline:** READY on Tuesday 2026-11-17 in the evening; reviewers use it on Wednesday, the release is Wednesday afternoon; no task touches a signing key.
If gate G1 (task W1) fails, the session says so at once and the release is the fallback release, `pdf-overlay` with a version bump (R26), as the brief requires.
**Build:** test-first, each new test seen red before its code; Sonnet builders (Codex is at its limit until 16:11 on Monday; after that a task may go to Codex at medium); lanes, clashes, the checkpoint, and the cut line are in "Order and lanes".
**Review:** one Opus plan review, with no recheck if it finds no Critical; the build's review by Sonnet from the correctness angle.

## What exists today

- **The parse.** `parseTypst` (`src/domain/source/typst-parse.ts`, 164 lines, at its size baseline, `test/structure/size.test.ts:7`) yields `open`, `close`, and `text` ops: headings open `h` (`:77-80`), list items `li` (`:81-84`), `*` and `_` open `strong` and `em` (`:107-113`), `` ` `` and `$` open a `raw` code element with class `gr-math` or `gr-raw` around one text op (`:114-120`), an escape `\x` is a one-character text op after the backslash (`:103-105`), statement lines (`#set`, `#import`, `#bibliography`, and the rest) are skipped whole, a `#name(...)` call's arguments are skipped, and a `#name[...]` content block opens `content` with class `gr-fn-<name>`, so footnote text is markup text.
- **The applied text.** `DraftReview` builds the applied text from the joined proposals (`src/domain/review/draft-review.ts:30-37`) and maps offsets both ways through `AppliedMap` (`:43-44`), where `fromApplied` answers `{ inside: id }` for a position inside new words.
- **Matching.** `sourceKey(file, text, ops)` keys only text-op characters (`src/domain/pdf/match.ts:24-37`), `pdfKey(pages)` keys a PDF's text items (`:40-55`), `toSource` maps a PDF selection back to source offsets (`:87-93`), and `placeItem` places an item's words with a widening context ladder (`src/domain/pdf/proposal-marks.ts:24-56`).
- **The PDF pass.** `PdfMarks.setView` loads the uploaded PDF once through `pdf.show()` into `pdfIndex` (`src/app/pdf-marks.ts:20-37`), `deferPdf` places every item 400 ms after the last change and returns early when the items' signature is unchanged (`:43-71`), and `applyOff` keeps "Not shown on the PDF." in step (`:72-78`, the card line at `src/ui/card.tsx:17`).
  A PDF selection opens a comment form through `toSource(this.s.source, ...)` then `targetFor(from, to)` (`src/app/session.ts:58-64`).
- **The PDF view.** `createPdfView(el, { url, workerUrl })` (`src/adapters/pdfjs/pdf-view.ts`, 216 lines, at its baseline, `size.test.ts:8`) loads one document by URL, draws pages lazily, and draws marks through `drawPageMarks` (`src/adapters/pdfjs/mark-draw.ts:23`), whose drawn words take only `style.fontFamily` and a size (`:37`); the insertion label is always visible (`css/review.css:42`), the marks layer takes no pointer events (`:37`), and the pressed switch button differs only by a light background (`:33`).
- **The switch.** The header island shows Editor, PDF, Both and, outside the editor view, "Changes" and "New text" (`src/ui/head.tsx`); `PdfLook` is `'changes' | 'new'` (`src/app/view.ts:3`), stored per link (`src/app/ports.ts:51-52`).
- **The draft seam.** `ReviewApi.draft()` returns `{ main, files }` (`src/app/ports.ts:37`); the server returns only the main file (`lib/Service/DraftLocator.php:13-17`, `lib/Controller/ReviewController.php:142-155`); `isAuthenticated` turns an unauthenticated `draft`, `pdf`, `open`, or `save` into a 404 (`ReviewController.php:52-58`); routes are in `appinfo/routes.php`.
  The reviews folder is the shared folder's sibling, `<name> reviews` (PLACE-1, `docs/decisions.md:71`).
- **Build and package.** `scripts/build.mjs` writes `js/gloss-review.js` (IIFE), `js/pdf.worker.js` (ESM), and `css/pdf-text-layer.css`; `scripts/package.sh` archives (`:22`) the committed allowlist (`:6`) `appinfo lib templates css js/gloss-review.js js/pdf.worker.js LICENSE README.md THIRD-PARTY.md` by `git archive HEAD`, mirrored in `test/structure/package.test.ts:15`, which expects version `0.1.1` (`:72`); `test/structure/no-eval.test.ts` forbids `new Function(` and `eval(` in every `js/*.js`; CI rebuilds and fails on any diff in `js`, `css`, or `THIRD-PARTY.md` (`.github/workflows/ci.yml:23-26`) and runs PHPUnit on PHP 8.2 and 8.4 (`:28-45`).
- **Pictures.** `scripts/shots/synthetic.mjs` serves the real bundle against a route-mocked page and API for the scenes in `syntheticScenes` (`:4`), with fixtures `Review/paper.typ` and `Latex/paper.tex` (`:7`); `scripts/dev-nc.sh` copies `Review`, `Plain`, `Latex`, and `Long` (`:79`, `:173-176`).

## Probes

On MewTwo, 2026-11-16, synthetic text only; the files are in `~/.cache/gloss-work/pdfdiff/` (`probe/` for the downloaded packages and fonts, `tprobe/` for the Typst sources, `tprobe-scripts/long.mjs`).

- **Q1, the author's Typst.** `typst --version` gives `typst 0.15.1 (9dfd3a08)`.
- **Q2, the compiler packages.** `npm pack` of `@myriaddreamin/typst-ts-web-compiler`: 0.7.0, the latest stable, embeds typst-assets 0.14.2 (Typst 0.14.2); `0.8.0-rc4`, published 2026-11-09, embeds typst-assets 0.15.1 and hayagriva 0.10.1, matching Q1's 0.15 line; its wasm strings name the Typst git checkout `typst-a1cd3ade704ca26e/59b5999`, so "Typst 0.15" is inferred from the assets version until gate G1 compiles `#sys.version` and asserts it.
  The rc's wasm is 30,167,169 bytes, 10,923,189 bytes at `gzip -9`; its glue `pkg/typst_ts_web_compiler.mjs` is 63,016 bytes.
  Its `.d.ts` offers `TypstCompilerBuilder` (`set_dummy_access_model`, `add_raw_font`, `build`) and `TypstCompiler` (`add_source`, `map_shadow`, `reset_shadow`, `compile(main_file_path, inputs, fmt, diagnostics_format)` at `:51`, `evict_cache`).
  The glue holds two `new Function(getStringFromWasm0(...))` bodies (`:1103`, `:1125`), the wasm-bindgen imports behind `js_sys::Function`, and no `eval(`; the package's main entry `./pkg/wasm-pack-shim.mjs` holds a third `new Function('m', 'return import(m)')`, and the `"./*"` export lets a build import the glue module directly; the package ships no licence file.
- **Q3, wrapping in Typst 0.15.1.** `tprobe/wrap.typ` compiles (exit 0) with wrappers `#gloss-review-del[...];` and `#gloss-review-ins[...];` in a heading, in a paragraph, across a soft line break, in a list item, inside a `#footnote[...]`, followed directly by `.`, `(y)`, and `[b]`, beside `@moss2020`, and with `#bibliography("refs.bib", style: "american-psychological-association")`; `pdftotext` shows "Alpha plants growflourish.", "and (x)(y) and a[b]", "Cited (Moss & Fern, 2020)", and the footnote "Footnote added words.", so the trailing `;` ends each call and the following characters stay text.
- **Q4, native compile times, one thread** (`typst compile --jobs 1`, 16-core MewTwo, three runs each): the 10,000-line `longDraft()` (`scripts/make-long-draft.mjs:6-14`, 119 pages) 2,874 to 3,895 ms; the same with 2,000 wrapped replacements (`tprobe-scripts/long.mjs`, 124 pages) 6,195 to 7,151 ms, and 5,457 to 5,793 ms without the insertion highlight; the 20-line `wrap.typ` 132 to 139 ms.
  The browser's wasm is single-threaded and slower than native by a factor task M measures; Q4 is the lower bound.
- **Q5, diagnostics.** An unclosed `$` gives `broken.typ:2:6: error: unclosed delimiter` with exit 1; `#set text(font: "Nonexistent Sans")` with `--ignore-system-fonts` gives `warning: unknown font family: nonexistent sans` and exit 0, so a missing font is a warning, never an error.
- **Q6, size.** The 0.1.1 archive from `scripts/package.sh` is 681,706 bytes; the 17 default fonts of typst-assets v0.15.1 (`files/fonts/`, the Foxit `.pfb` files left out) are 9,683,068 bytes, 6,378,271 bytes as a tar.gz.
- **Q7, Nextcloud serving** (server `stable33`, read through `gh api`): `.htaccess` sends `.wasm` as `application/wasm` (`:72`) with no Content-Security-Policy header on static files (`:20-41`), and the generated rewrite rules serve `wasm`, `otf`, and `ttf` without `index.php` (`lib/private/Setup.php:593`); `OCP\AppFramework\Http\EmptyContentSecurityPolicy::allowEvalWasm` exists (`:122`) and adds `'wasm-unsafe-eval'` to `script-src` (`:465-466`).
- **Q8, not run.** Running the downloaded typst.ts wasm in Node (a compile of the synthetic paper with its `.bib`, its timing, and the shape of its diagnostics) was refused by this session's permission classifier, so the plan does not rest on it: task W1's gate G1 establishes it in the repository, in a browser, before any task depends on it.
- **Q9, PHP.** MewTwo has neither `php` nor `docker` (`which docker php` prints nothing); `gh run list` reaches the repository's CI (run 43858422383, `pdf-proposals`, success).

## Size limits and the typing path

- **Archive.** The App Store refuses archives over `MAX_DOWNLOAD_SIZE`, 30 MiB (31,457,280 bytes; `~/.cache/gloss-work/pdfdiff/facts.md:3`).
  Estimate from Q2 and Q6: 0.68 MB today, 10.92 MB wasm, 6.38 MB fonts, under 0.2 MB glue and notices, about 18.2 MB, 58 % of the limit; the plan's review measured 17,341,067 bytes for the wasm and the 17 fonts alone, which agrees; task R measures the real archive once, outside the test suite.
- **Download.** The worker and its wasm are fetched only when a PDF view first shows "Changes" or "New text" for a Typst draft (R6): 30.2 MB of wasm and 9.7 MB of fonts on that first open, cached by the browser for six months (`.htaccess:46-53`), their URLs carrying the app version as a query so that an update refetches them (R24); a reviewer who stays in the editor downloads none of it.
- **Typing.** Nothing compiles on the typing path: compiles run in the worker, 600 ms after the last change, at most one at a time (R14); typing never waits for a compile.
- **Source files.** Every new source file stays within 150 lines; `pdf-view.ts` and `typst-parse.ts` keep or lower their baselines.

## Design rulings

### Compiler and assets

- **R1.** Ruling: the compiler is typst.ts's `@myriaddreamin/typst-ts-web-compiler` pinned exactly at `0.7.0`, the latest stable release, with Typst 0.14.2 bundled and a wasm of 28,325,178 bytes (10,767,665 at `gzip -9`); why: the coordinator's version ruling puts the stable release first, and gate G1 compiled every fixture and wrapper construct the plan names on it; **Refined:** the plan's earlier pin of `0.8.0-rc4` (Typst 0.15.1) is kept only as the fallback, to be taken only if 0.7.0 cannot compile a fixture or the 0.15 syntax the plan names, with the failing construct recorded; cost if wrong: a draft written for Typst 0.15 can fail to compile, which rule 5 turns into the overlay with its line; 0.7.0 has no `evict_cache`, so the worker guards that call.
- **R2.** Ruling: the low-level `TypstCompilerBuilder` runs in a dedicated module worker, compiles to PDF, and the page shows that PDF through the existing pdf.js view; why: one way to show a PDF (SAME-1, lodge d-7779qs), so marks, selection, and `pdfKey` work unchanged, and the low-level API has exactly what is needed (Q2) with no package registry set, so packages cannot load; cost if wrong: a second renderer would be needed only if pdf.js cannot read Typst's PDFs, which G1 checks.
- **R3.** Ruling: the worker imports `@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler.mjs`, never the package's main entry, and the build replaces that module's two `new Function(...)` call sites with a lookup of the constant bodies the glue builds, failing unless it replaced exactly two; why: the main entry maps to a shim holding a third body, which would make the count three and `test/structure/no-eval.test.ts` fail; that test covers every `js/*.js`; **Refined by gate G1:** the bodies are not reached only when `globalThis` is missing, as this ruling first assumed, since `set_dummy_access_model` and the builder create five functions from the constant strings `return 0`, `return true`, `path` with `return path`, and two `throw new Error('Dummy ...')` bodies at start, so a replacement that throws on every call makes the compiler fail to start; the replacement therefore returns the matching closure for these bodies and throws for any other; cost if wrong: a compile throws, the draft falls back with its line, and G1 shows it before anything else is built.
- **R4.** Ruling: the worker fetches `js/typst-compiler.wasm` as bytes and initialises the glue from them, and the page's Content-Security-Policy is not changed; why: Nextcloud serves `.wasm` statically with no CSP header (Q7), and a dedicated worker from a same-origin URL takes its policy from its own response, so `'wasm-unsafe-eval'` on the page is not needed; cost if wrong: the compiler cannot start on a server that sets a global CSP, the draft falls back with "the browser could not start the compiler", and task L's item 2 shows which.
- **R5.** Ruling: the 17 typst-assets v0.15.1 fonts are committed under `fonts/` with that tag's `NOTICE`, a test pins their names and sha256 sums, and the worker loads all 17 before its first compile; why: Typst's defaults are Libertinus Serif for text, New Computer Modern Math for maths, and DejaVu Sans Mono for raw text, and the brief forbids fetching fonts from elsewhere (request rule 1); cost if wrong: 9.7 MB more on the first open than loading per family would cost.
- **R6.** Ruling: the worker is created on the first compile request, which only a PDF or Both view with look "Changes" or "New text" on a Typst draft sends; why: request rule 6; cost if wrong: none beyond a first compile that waits for the download, during which the uploaded PDF shows (R18).
- **R7.** Ruling: the browser derives the files the draft reads (domain `typstReads`) and fetches each by `GET /r/{token}/file?path=<root-relative path>`; the server resolves only below the shared folder; **Refined:** of the brief's two options (request rule 2), a server-derived list would need a Typst parser in PHP beside the one in `src/domain/source/`, a second implementation (lodge d-7779qs); why: the path rules are a small pure service with tests; cost if wrong: a file the browser's scan misses fails the compile, and the draft falls back with "reads a file".
- **R8.** Ruling: `SharedPath::normalise` refuses an empty path, a leading `/`, a backslash, NUL, a segment that is empty or starts with `.` (so `..`, `.`, and `.gloss-review`), more than 16 segments, and more than 512 bytes; `SharedFiles::read` then answers only when the share carries the READ permission (`Constants::PERMISSION_READ`, from `$share->getPermissions()`), and only a `File` whose path begins with the shared folder's path followed by `/` and whose size is at most 20 MiB, and the route has the same authentication as `draft` (`ReviewController.php:52-58` gains `file`); why: request rule 2 limits served files "to the shared folder and to the share's rights", and its hard rule makes that a tested requirement (nothing outside the shared folder, nothing from the reviews folder); `..` refusal covers the reviews folder because it is a sibling (PLACE-1, `ReviewStore.php:95-110`), and the prefix check covers anything a storage backend resolves elsewhere, with the trailing `/` so that `/u/files/Review reviews/x.json` is not accepted for the folder `/u/files/Review` (`ReviewController.php:215-221` checks no permission today); cost if wrong: a draft reading a dot-file or a file over 20 MiB falls back, and a share without read rights serves nothing.
- **R9.** Ruling: PHP tests are written first and pushed alone, so CI's `php` job shows them red, then the code, so it shows them green, and the builder names both run ids; why: MewTwo has no PHP or Docker (Q9) and CI runs PHPUnit on 8.2 and 8.4 (`ci.yml:28-45`); the brief's Docker route works only on the laptop (`scripts/php.sh test`); cost if wrong: a CI round of about a minute per push (run 43858422383 took 47 s).

### The generated sources

- **R10.** Ruling: the diff source is the draft with two `#let` lines prepended (`gloss-review-del`, red `strike`; `gloss-review-ins`, green `underline` over a light green `highlight`) and each proposal written as `#gloss-review-del[old];#gloss-review-ins[new];`, an empty side left out; why: Q3 shows the trailing `;` keeps a following `.`, `(`, or `[` as text, and wrapped words reflow like an inline diff, as you asked; cost if wrong: a wrap that breaks the compile, which R12 catches per proposal.
- **R11.** Ruling: a proposal is wrapped only when all of these hold.
  Every character of its old range that is not a soft line break lies in a text op whose innermost open op is the paragraph, `h`, `li`, `strong`, `em`, or a `gr-fn-*` content block, never a `gr-math` or `gr-raw` code element or a `gr-ref` span, with no blank line, no line break inside a heading or list item, and no boundary straight after a backslash.
  Neither its old nor its new words contain `\`, `[`, `]`, `#`, `$`, `` ` ``, `*`, `_`, `<`, `>`, `@`, `//`, `/*`, a blank line, or a line break followed, after optional spaces, by `=`, `-`, `+`, `/`, or digits and a full stop.
  Neither its old nor its new words begin, after optional spaces, with `-`, `+`, `=`, or `/`, or with digits, a full stop, and a space, since the start of the wrapper's brackets counts as a line start in Typst (checked with native Typst 0.15.1: `start #gloss-review-ins[- dash words]; end.` renders a bullet and breaks the paragraph, and `= `, `1. `, and `/ Term:` do the same); these words are refused, not escaped, so no old word changes.
  An insertion is judged by the characters on either side of its point, a newline or the document's end on a side counting as a text side.
  Otherwise the new words replace the old ones unwrapped and the proposal is **unmarked**; why: request rule 3 names markup text runs as the only place to wrap, and these characters are the ones that start markup or code inside the wrapper's brackets (`typst-parse.ts:97-120`); an unrefused marker compiles without error, so R12's rounds would never see it; cost if wrong: too strict leaves a few plain proposals unmarked, too lax breaks a compile that R12 repairs or, for the markers, shows a stray bullet or heading.
- **R12.** Ruling: the diff source always compiles by rounds: (1) compile it; (2) on an error, unwrap the proposals whose generated span lies on an error's line, or, when no span names a line, all wrapped proposals; (3) on an error, leave out the proposals named the same way, their old words kept and their cards showing "Not shown on the PDF."; (4) on an error, compile the unchanged draft; at most four compiles per change.
  An error whose message contains "file not found" or "failed to load file" ends the rounds at once with R18's file line, since no proposal causes it.
  When round 4 compiles, its PDF is shown with every proposal left out and every card showing "Not shown on the PDF.", and the page does not fall back; only when round 4 fails too does it fall back (rule 5).
  A round sequence stops and issues no further compile when a newer request is waiting (R16); why: request rule 3, "fall back for that proposal, never for the whole page", and acceptance test 4 (the page never falls back while the draft itself compiles); cost if wrong: an error far from its cause unwraps or leaves out a neighbour too, and a reviewer whose every proposal failed sees the unmarked draft.
- **R13.** Ruling: the "New text" source is `review.applied()` with each proposal's new words, where R11 allows, written `#gloss-review-new[...];` (a light yellow `highlight`), deletions leaving nothing, and the same rounds as R12; why: your earlier ask, "only shows the new version with proposals still highlighted" (request rule 3); cost if wrong: as R12.
- **R14.** Ruling: each generated source carries segments mapping its offsets to the draft (`copy`, `old`, `new`, and `syntax` for the prelude and wrappers); `toDraft` sends a range in `copy` or `old` text to its draft offsets, in `new` text to its proposal's old range, and in `syntax` nowhere; why: a PDF selection maps through `pdfKey`, `toSource` on the generated source's `sourceKey`, then `toDraft`, into `targetFor` (`session.ts:61-64`), the same path as today; cost if wrong: a selection inside new words targets the whole proposal, as the editor already does for `{ inside: id }` (`applied-map.ts`).

### Views

- **R15.** Ruling: the look switch is "Original", "Changes", and "New text" for every draft language; for a Typst draft that compiles, "Changes" and "New text" are compiled, otherwise and for LaTeX and Markdown they are 0.1.1's overlays; "Original" is the uploaded PDF with comment highlights only; the default stays "Changes"; **Refined:** the brief names "Original" for Typst (request rule 3); giving every language the same three keeps one switch with one behaviour (SAME-1); why: Original is your real output, so proposal marks there would repeat "Changes"; cost if wrong: one more button for LaTeX reviewers.
- **R16.** Ruling: a compile runs 600 ms after the last change through the `Scheduler` port, at once on a look or view switch, with one compile in flight and at most one waiting (a newer request replaces the waiting one), a result older than the newest request is dropped, and a running round sequence issues no further compile once a newer request waits; the worker is never terminated; why: request rule 3 ("about 600 ms", "cancel stale compiles"), and a running wasm compile cannot be interrupted, while terminating the worker loses its warm caches and fonts; cost if wrong: on a very long draft a change waits for the compile already running (Q4).
- **R17.** Ruling: `PdfPort.showBytes(bytes)` replaces the shown document, destroys the previous loading task and disconnects its observers, draws the visible pages before swapping the container's children (so the Both view does not flash blank pages), and keeps the scroll container's `scrollTop`, clamped to the new height; `show()` keeps loading the uploaded PDF; why: request rule 3 ("keep scroll position") with one PDF view (R2), and `load()` in `pdf-view.ts` creates observers and pages on each call without destroying the previous task, which every recompile would leak; cost if wrong: after a reflow the view sits a little off the edited spot.
- **R18.** Ruling: the PDF area never shows nothing: until the first compile lands, and on any fallback, it shows the uploaded PDF with the overlay of the chosen look, and the header shows one quiet line (`HeadView.pdfNote`) beside the switch: "Showing your PDF while the draft compiles.", "Showing your PDF; the draft uses a package the browser cannot load.", "Showing your PDF; the draft reads a file the browser cannot load.", "Showing your PDF; the draft uses a font the browser does not have.", "Showing your PDF; the draft does not compile in the browser.", or "Showing your PDF; the browser could not start the compiler."; a package is an `#import` or `#include` of a string starting with `@`, found before any download; a missing font is a warning containing "unknown font family" (Q5); why: request rule 5; cost if wrong: a draft that would compile with a substitute font shows the overlay instead.
- **R19.** Ruling: an unmarked proposal gets a `margin` mark, a 3 px green bar left of the text column at the height of its new words, placed by `placeItem` on the compiled PDF, and its card the line "Shown in the PDF without marks; Typst cannot mark text inside maths, code, or an argument."; when the bar cannot be placed the card line still shows; **Refined:** the brief's "margin mark" is drawn by the page, not by Typst, because a mark written into the source cannot go inside maths, raw text, or a string argument; why: the overlay already places words on a PDF (`proposal-marks.ts:24`); cost if wrong: a maths change whose glyphs pdf.js extracts differently gets no bar, only its card line.
- **R20.** Ruling: in a compiled look, comment highlights and margin bars are placed on the compiled PDF with each item's range mapped into the generated source (`fromDraft`), against that source's `sourceKey`; struck words and carets are never drawn there, because the compiled page shows them; why: one placement function for both kinds of document; cost if wrong: none found.

### The overlay fixes (LaTeX, Markdown, and the Typst fallback)

- **R21.** Ruling (4a, PDFLBL-1 = B): an insertion shows its caret only; the caret is focusable (`tabIndex = 0`, `aria-label` the new words) and shows its label while hovered or focused, and a tap toggles it; the caret takes its own stacking above the text layer (`z-index: 3` against `.gr-page .textLayer`'s `z-index: 2` at `css/review.css:43`, `pointer-events: auto` on the caret only, the marks layer keeping `none` at `:37`); why: request rule 4a, and the text layer covers the marks layer, so without the stacking the pointer never reaches the caret and the label shows only on keyboard focus; cost if wrong: a caret too thin to hover, which hand check H5 looks at by mouse coordinates.
- **R22.** Ruling (4b): drawn words take the generic family (serif, sans-serif, or monospace) from pdf.js's `textContent.styles[fontName].fontFamily`, bold from the loaded font's `bold` or `black` flag or a name matching `bold|black|heavy|semibold`, italic from its `italic` flag or a name matching `italic|oblique`, read from `page.commonObjs` once the page has rendered, at the line's size; why: request rule 4b; cost if wrong: a word drawn upright where the PDF's was italic, looked at in H5.
- **R23.** Ruling (4c): a pressed switch button gets `--color-primary-element` as background, `--color-primary-element-text` as text colour, weight 600, and an inset 2 px outline in the text colour; the synthetic page defines `--color-primary-element-text` in both themes; why: request rule 4c, in Nextcloud's own pressed colours; cost if wrong: none found.

### Release

- **R24.** Ruling: `scripts/build.mjs` also builds `src/adapters/typst/worker-entry.ts` to `js/typst.worker.js` (ESM, R3's plugin) and copies the pinned package's wasm to `js/typst-compiler.wasm`, and defines the app version read from `appinfo/info.xml` into the page bundle, which appends it as `?v=<version>` to the worker, wasm, and font URLs; the files are committed, as is `fonts/`; the allowlist in `package.sh` and its test gain `js/typst.worker.js`, `js/typst-compiler.wasm`, and `fonts`; why: `package.sh` archives `git archive HEAD` (`:22`) and CI's bundle check covers `js` (`ci.yml:25`), so a drifted wasm fails CI; a 30 MB blob is under GitHub's 100 MB file limit; the `.htaccess` six-month cache would otherwise hold an old worker or wasm after an update, and baking the version in at build time leaves the template and controller unchanged; cost if wrong: 30 MB more in the repository's history per compiler update, and a version bump needs a rebuild of the bundle; whether Nextcloud's own asset versioning reaches a URL fetched by a worker is not verified, which is why the query is explicit (task L's item 2 looks).
- **R25.** Ruling: `scripts/third-party.mjs` adds the compiler package, and, since it ships no licence file (Q2), appends the committed texts in `notices/`: typst.ts's `LICENSE` at the tag of `0.7.0` (or the commit named in the package's repository if no tag exists, recorded in the file's first line), Typst's `NOTICE` and `LICENSE` at `v0.14.2`, and typst-assets' `NOTICE` at `v0.15.1`, which covers the fonts (OFL, the DejaVu and Bitstream Vera licence, the GUST font licence); why: the notices must cover what the archive ships; cost if wrong: an incomplete notice found in review.
- **R26.** Ruling: PDFDIFF-1 goes into `docs/decisions.md` after PDFLBL-1, which task O1 writes after PDFP-1, and records the Typst version gate G1 read (`#sys.version` gives 0.14.2); PDFP-1's last line (`:122`) is rewritten in place to say that compiling in the browser shipped in 0.2.0 under PDFDIFF-1; the full release is version 0.2.0 in `appinfo/info.xml` and `test/structure/package.test.ts:72`; why: request rule 7; cost if wrong: a decision recorded late, a one-commit fix.
- **R27.** Ruling: tasks O1 and O2 build on their own branch `pdf-overlay` from `83222f6`, and `pdf-overlay` is merged into `pdf-compile` (a merge, never a rebase) after O1, before A1 starts, and again after O2, before V1 starts; the fallback release is `pdf-overlay` plus task Q's version bump to 0.1.2, packaged and checked on its own and never merged into `pdf-compile`; why: the request's line 5 asks for a fallback that is safe, and by Tuesday 13:00 `pdf-compile` carries the 30 MB wasm, the fonts, and bundles rebuilt by later tasks, from which lane O alone could only be picked out by hand under time pressure (plan review I9); 0.1.2 rather than 0.1.1 so the fallback does not depend on whether 0.1.1 was uploaded (`~/.cache/gloss-work/pdfprop/park.md`); cost if wrong: one merge per lane O task, and a bundle conflict settled by rebuilding (0.1.1's R19 rule).

## Layers and interfaces

```ts
// src/domain/typst/reads.ts (new): pure.
/** Root-relative, normalised, deduplicated paths that `file` reads: #bibliography (a string or an array), #include, #import of a path, read, image, json, csv, yaml, toml, xml, cbor; relative to `file`'s folder, a leading "/" meaning the shared folder; skips strings and comments through `typst-scan.ts`. */
export function typstReads(file: string, text: string): string[]
/** An #import or #include of "@namespace/...", outside comments. */
export function importsPackage(text: string): boolean

// src/domain/source/typst-scan.ts (new): the string-skipping loop that `skipBalanced` and `statementEnd` repeat (`typst-parse.ts:23-43`), moved out of `typst-parse.ts`, which shrinks below its 164-line baseline, plus one comment skipper new to both callers; `typst-parse.ts` does not skip comments today.

// src/domain/typst/wrap-rule.ts (new): R11.
export function wrappable(draft: string, ops: readonly Op[], from: number, to: number, words: string): boolean

// src/domain/typst/generated.ts (new): R10, R13, R14.
export type Segment = { at: number; length: number; draft: number; kind: 'copy' | 'old' | 'new' | 'syntax'; id?: string }
export type Generated = { text: string; segments: readonly Segment[]; wrapped: ReadonlySet<string>; unmarked: ReadonlySet<string>; omitted: ReadonlySet<string> }
export type Shape = { unwrap: ReadonlySet<string>; omit: ReadonlySet<string> }
// Both build on `DraftReview.rewrite(wrap: (p: Proposal, at: number) => string): string`, which takes over the applied-text loop of `draft-review.ts:30-37` (so the file stays at its 154-line baseline, `size.test.ts:6`); `wrap` returns the text for the proposal's span and `at` is the generated offset where it starts.
export function diffSource(review: DraftReview, draft: string, ops: readonly Op[], shape: Shape): Generated
export function newSource(review: DraftReview, draft: string, ops: readonly Op[], shape: Shape): Generated
export function toDraft(g: Generated, from: number, to: number): { from: number; to: number } | null
export function fromDraft(g: Generated, at: number): number

// src/domain/typst/rounds.ts (new): R12.
export type Diagnostic = { severity: 'error' | 'warning'; message: string; line: number | null }  // line is one-based in the generated text
export function nextShape(g: Generated, shape: Shape, diagnostics: readonly Diagnostic[]): Shape | 'draft'

// src/app/ports.ts
export type CompileJob = { main: string; sources: readonly { path: string; text: string }[]; files: readonly { path: string; bytes: Uint8Array }[] }
export type CompileResult = { pdf: Uint8Array | null; diagnostics: readonly Diagnostic[]; ms: number } | { failed: 'start' }
export interface CompilerPort { compile(job: CompileJob): Promise<CompileResult> }
// ReviewApi gains: file(path: string): Promise<{ bytes: Uint8Array; text: string | null } | null>   (the adapter decodes: text is the UTF-8 text for a `.typ` path and null for any other path or for bytes that are not valid UTF-8, because `src/app` compiles under `tsconfig.pure.json` with no `TextDecoder`)
// PdfPort gains: showBytes(bytes: Uint8Array): Promise<{ pages: readonly (readonly string[])[] }>
// PdfMark gains: (PdfPlacement & { look: 'margin' })
// Ports gains: compiler: CompilerPort | null   (null for every language but Typst, and in tests that do not need it)

// src/app/view.ts
export type PdfLook = 'original' | 'changes' | 'new'
// CardView gains unmarked: boolean; HeadView gains pdfNote: string (`src/ui/panel-model.ts:31` builds a HeadView too and gains it)

// src/app/compiled-pdf.ts (new): R16, R18; owns the timer, the generation, the inputs cache, and the rounds.
export class CompiledPdf { request(now: boolean): void; dispose(): void }
// src/app/compiled-doc.ts (new): R14, R19, R20; the shown document's sourceKey, toDraft, and marks.
export type PdfDoc = { source: SourceKey; toDraft(from: number, to: number): { from: number; to: number } | null }
// SessionState gains pdfDoc: PdfDoc | null (the uploaded PDF's is { source: s.source, toDraft: identity }), pdfNote, unmarked.
// src/app/pdf-marks.ts owns the shown document: its `pdfIndex` and `PdfDoc` change together through `PdfMarks.showBytes(bytes)` and `show()`, each of which clears `pdfCache` and the scheduled signature (`:43-71` returns early on an unchanged signature), as does a look change; `place()` matches against `s.pdfDoc.source`, not `s.source`.

// src/adapters/typst/protocol.ts (new): the worker's message handling over a narrow compiler interface, testable with a fake.
// src/adapters/typst/worker-entry.ts (new): binds protocol.ts to the glue; built to js/typst.worker.js.
// src/adapters/typst/compiler.ts (new): createTypstCompiler(workerUrl, wasmUrl, fontBase): CompilerPort; one lazy worker, transfer of the PDF bytes.
```

Domain stays free of npm and clocks; `CompiledPdf` takes time only through `Scheduler`; the worker measures `ms` with `performance.now()`, which adapters may read.
`main.ts` derives the worker, wasm, and font URLs from `data-worker`'s folder (`js/pdf.worker.js` beside `js/typst.worker.js`, `../fonts/`) and appends `?v=<app version>` to each (R24), so the template and controller do not change for them.
The worker converts typst.ts's diagnostic ranges to one-based lines of the main file and drops ranges in other files to `line: null`.

## Acceptance tests

1. A Typst draft opened in the PDF view shows, after its compile, the diff source's PDF: the fixture's deletions struck in red and insertions underlined in green, the paragraph reflowed (pixel check in scene `typst-compile`, light and dark).
2. "New text" shows the applied source's PDF with the new words highlighted and the deleted words gone; "Original" shows the uploaded PDF with the comment's highlight and no proposal marks, also after a live switch from "Changes" to "Original" and back, and a comment placed on "Changes" is placed again on the recompiled document after an edit.
3. The maths and argument proposals are unmarked: compiled with their new words, a margin bar where placed, and the card line of R19.
4. A proposal whose new words break the compile is left out alone; the rest stay marked; the page never falls back while the draft itself compiles.
5. A draft with `#import "@preview/..."` shows the uploaded PDF with the overlay and the package line, and downloads no wasm.
6. A PDF selection on each look opens the comment form on the right draft words.
7. Typing 40 characters in the editor sends one compile, 600 ms after the last key; a result of an older request is never shown; the scroll position survives the recompile.
8. `GET /file` serves a file in the shared folder or a subfolder and refuses `..`, a leading `/`, `.gloss-review`, a folder, a file above 20 MiB, a path into `<name> reviews` (also when a storage backend resolves a node to `<name> reviews`), and any request on a share without read permission.
9. LaTeX: carets without visible words until hover, focus, or tap; New text words in the line's family, weight, and slant; the pressed look button plainly pressed, light and dark.
10. `npm run check` green; CI green on both jobs; the archive under 30 MiB with its sha256.
11. The fallback release (`pdf-overlay` at 0.1.2, task Q) passes `npm run check` and its archive is under 30 MiB with its sha256, without any file of lane C, W, or A.

## Tasks

Commands, from the clone's root; `job <name> -- <command>` below stands for the two lines

```bash
HEAVY_MODE=none /home/kiibou/work/tools/heavy-job.sh start /tmp/gloss-jobs <name> -- <command>
/home/kiibou/work/tools/heavy-job.sh wait /tmp/gloss-jobs <name>
```

repeated until the wait reports an exit, whose code is read (`CLAUDE.md:26-35`).
Focused tests: `job unit -- npm test -- --maxWorkers=2 <files>`.
Every task ends with `job check -- npm run check -- -- --maxWorkers=2` passing, the bundles rebuilt and committed when `src/`, `css/`, or the build changed (`CLAUDE.md:40`), and a commit with explicit paths pushed to its branch (`pdf-overlay` for O1, O2, and Q; `pdf-compile` for every other task).
A task marked UI ends with its hand checks through `scripts/shots.mjs --fixture synthetic`, both pictures of each looked at, and what each shows named in the commit.
Builder: Sonnet for every task unless it says otherwise; the session runs L, R, and Q.

### Lane O: the overlay fixes (on `pdf-overlay`, releasable alone)

Lane O builds on `pdf-overlay` from `83222f6` (R27); its commits push to `pdf-overlay`, and the session merges the branch into `pdf-compile` after O1 and after O2.

#### Task O1: carets with hidden words, and a plainly pressed switch (lane O, first; UI)

**Files:** `src/adapters/pdfjs/mark-draw.ts`, `css/review.css`, `docs/decisions.md` (the PDFLBL-1 = B section after PDFP-1), `scripts/shots/synthetic.mjs` (the `--color-primary-element-text` variable), `scripts/shots/scenes.mjs` (the `pdf-proposals` and `latex-proposals` checks move the mouse over the caret's coordinates before reading its label, never calling `focus()`), `test/adapters/pdfjs/mark-draw.test.ts`, `test/scripts/scenes.test.mjs` if it pins label visibility.
**Interfaces:** R21, R23; the label keeps class `gr-pdf-label`, now a child shown by `:hover`, `:focus-visible`, `:focus`, or class `gr-open`; the caret has `z-index: 3` and `pointer-events: auto` above the text layer's `z-index: 2`, the marks layer keeping `pointer-events: none`.

- [ ] Write the tests: a caret has `tabIndex` 0 and `aria-label` equal to its words; a click toggles `gr-open` on it and on no other caret; run `job unit -- npm test -- --maxWorkers=2 test/adapters/pdfjs/mark-draw.test.ts`; expect FAIL.
- [ ] Write it, with the CSS of R21 and R23; run; expect PASS; `job build -- npm run build`.
- [ ] Hand checks H5 (carets, hovered by mouse coordinates) and H6 (switch); write the PDFLBL-1 = B section.
- [ ] Commit; the session merges `pdf-overlay` into `pdf-compile`.

#### Task O2: drawn words in the PDF's font style (lane O, after O1; UI)

**Files:** `src/adapters/pdfjs/mark-draw.ts`, `src/adapters/pdfjs/new-text-draw.ts`, `src/adapters/pdfjs/pdf-view.ts` (passes a `fontOf(item)` lookup into the page; stays at or under 216 lines), `test/adapters/pdfjs/new-text-draw.test.ts`, `test/adapters/pdfjs/mark-draw.test.ts`, `test/adapters/pdfjs/pdf-view.test.ts`.
**Interfaces:** R22; `Entry` gains `weight: 'normal' | 'bold'` and `slant: 'normal' | 'italic'`; `MarkPage` gains `fontOf?(item: number): { family: string; weight; slant }`.

- [ ] Write the tests: a struck item whose font is `ABCDEF+Serif-BoldItalic` draws its new words serif, bold, and italic at the item's size; a sans item with `bold: true` and a plain name draws bold sans-serif; with no loaded font the family falls back to the style's and the weight to normal; the callout takes the same style; run `job unit -- npm test -- --maxWorkers=2 test/adapters/pdfjs`; expect FAIL.
- [ ] Write it; run; expect PASS; build.
- [ ] Hand check H5 (New text on LaTeX, the `\textbf` and `\emph` lines).
- [ ] Commit; the session merges `pdf-overlay` into `pdf-compile` before V1 starts.

### Lane F: serving the files the draft reads, and fetching them

#### Task F1: the file route (lane F, first; PHP, red and green in CI by R9)

**Files:** `lib/Service/SharedPath.php` (new), `lib/Service/SharedFiles.php` (new), `lib/Controller/ReviewController.php`, `appinfo/routes.php`, `tests/Unit/Service/SharedPathTest.php` (new), `tests/Unit/Service/SharedFilesTest.php` (new), `tests/Unit/Controller/ReviewControllerTest.php`.
**Interfaces:** R8; route `['name' => 'review#file', 'url' => '/r/{token}/file', 'verb' => 'GET']`; `file(string $path)` answers the bytes as `application/octet-stream` through `StreamResponse`, or 404 with `{ error: 'The draft reads a file this link cannot serve.' }`.

- [ ] Write the tests: `normalise` on `refs.bib`, `data/a.csv`, `a//b`, `/abs`, `../x`, `a/../b`, `./a`, `.gloss-review`, `a\b`, a NUL, 17 segments, 513 bytes; `read` with a mocked `Folder` for a file, a folder, a missing node (`NotFoundException`), a node whose `getPath()` lies outside the shared path, a node whose `getPath()` is `/u/files/Review reviews/x.json` for the shared folder `/u/files/Review` (refused), a share without the READ permission (refused, and a share with it served), a 20 MiB plus one byte file, and `../Review reviews/x.json`; the controller's 404 and its stream, and `isAuthenticated` throwing for `file` when unauthenticated; push the tests alone and read the red `php` job with `gh run list --commit <sha of the tests-only push>`, never the branch's latest run, since two sessions push to `pdf-compile`.
- [ ] Write the services, the route, and the action; push; read the green run; name both run ids in the commit message of the code.
- [ ] Commit (twice: tests, then code).

#### Task F2: the browser's side (lane F, no dependency)

**Files:** `src/adapters/http/review-api.ts`, `src/app/ports.ts` (`ReviewApi.file`), `test/adapters/http/review-api.test.ts`, `test/app/fakes.ts`.
**Interfaces:** `file(path)` sends `GET <base>/file?path=<encodeURIComponent(path)>` with the request token, answers `{ bytes, text }` on 200, `text` being the UTF-8 decoding for a `.typ` path and `null` for any other path or for bytes that are not valid UTF-8 (`TextDecoder` with `fatal: true`), and `null` on any refusal or network failure.

- [ ] Write the tests with `fetch` faked: the URL and header, bytes on 200, `text` decoded for `a.typ` and `null` for `refs.bib` and for invalid UTF-8 in a `.typ`, `null` on 404 and on a rejected fetch; run `job unit -- npm test -- --maxWorkers=2 test/adapters/http`; expect FAIL.
- [ ] Write it; run; expect PASS.
- [ ] Commit.

### Lane C: the generated sources and the compile pipeline

#### Task X1: the synthetic Typst fixture (lane C, first; no code)

**Files:** `test/fixtures/nc/Typst/paper.typ`, `test/fixtures/nc/Typst/references.bib`, `test/fixtures/nc/Typst/.gloss-review` (`{}`), `test/fixtures/nc/Typst/paper.pdf`, `test/fixtures/nc/Typst/package.typ` (the fallback variant), `scripts/dev-nc.sh` (copies `Typst`), `test/scripts/dev-nc.test.mjs` if it pins the folder list.
**Interfaces:** an invented paper, in the words of `Review/paper.typ`'s garden (never your paper's): `#set text(lang: "en", size: 11pt)`, a title heading and two section headings, three paragraphs with one soft line break mid-sentence, a three-item list, one display equation `$ a^2 + b^2 = c^2 $`, one `#footnote[...]`, one `#underline(offset: 2pt, [...])` call whose words are an argument, two citations `@` of two invented `.bib` entries, and `#bibliography("references.bib", style: "american-psychological-association")`; `paper.pdf` compiled by `typst compile paper.typ` (0.15.1, Q1); `package.typ` is `paper.typ` with `#import "@preview/example:0.1.0"` as its first line.

- [ ] Write the files; compile `paper.pdf`; check with `pdftotext` that the APA references print; check `dev-nc.sh`'s tests.
- [ ] Commit.

#### Task D1: what the draft reads (lane C, after X1)

**Files:** `src/domain/typst/reads.ts` (new), `src/domain/source/typst-scan.ts` (new), `src/domain/source/typst-parse.ts` (the string loop moves out; lowers its baseline at `size.test.ts:7`, and the task lowers the entry), `test/domain/typst/reads.test.ts` (new), `test/domain/source/typst-scan.test.ts` (new), `test/structure/size.test.ts`.
**Interfaces:** `typstReads`, `importsPackage`, and the shared scanner (M9: one string and comment skipper for the parse and the reads, lodge d-7779qs).

- [ ] Write the tests: the fixture's `references.bib`; an array bibliography; `#include "ch/one.typ"` from `main.typ` and `image("fig.png")` inside `ch/one.typ` giving `ch/fig.png`; a leading `/`; `..` resolved inside the folder and a path escaping it dropped; a read inside a comment or inside a string ignored; `typst-scan.ts` skips a string with an escaped quote, a line comment, and a block comment; `typst-parse.test.ts` passes unchanged; `#import "lib.typ": f` read and `#import "@preview/x:0.1.0"` and `#include "@local/y:1.0.0"` flagged by `importsPackage`; run `job unit -- npm test -- --maxWorkers=2 test/domain/typst test/domain/source`; expect FAIL.
- [ ] Write it; run; expect PASS.
- [ ] Commit.

#### Task D2: the wrap rule and the generated sources (lane C, after D1)

**Files:** `src/domain/typst/wrap-rule.ts` (new), `src/domain/typst/generated.ts` (new), `src/domain/review/draft-review.ts` (`rewrite` takes over the applied-text loop; stays at or under 154 lines), `test/domain/typst/wrap-rule.test.ts` (new), `test/domain/typst/generated.test.ts` (new), `test/domain/review/draft-review.test.ts`.
**Interfaces:** `wrappable`, `diffSource`, `newSource`, `toDraft`, `fromDraft` (R10, R11, R13, R14), both sources built on `DraftReview.rewrite` (M9: one applied-text step, lodge d-7779qs).

- [ ] Write the tests on the fixture's text: a replacement in a paragraph, an insertion, a deletion, a replacement across the soft line break, and one in a heading are wrapped, giving the exact `#gloss-review-del[...];#gloss-review-ins[...];` text; one in the equation, one in the `#underline` argument, one whose new words contain `$`, and one spanning a blank line are unmarked with their new words in place; in `wrap-rule.test.ts`, old or new words beginning `- dash`, `= head`, `1. first`, and `/ Term:` are refused, as are the same after a line break and after indentation, while `3 - 5 days` replaced inside a line is wrapped; an insertion at a line's end and one at the document's end are judged with the newline or end as a text side; `DraftReview.rewrite(p => p.proposal)` equals `applied()`; inside the footnote is wrapped; `shape.unwrap` and `shape.omit` behave per R12; `toDraft` of a range in copied text, in old words, in new words (the proposal's old range), and in the prelude (null); `fromDraft` past three proposals; the `newSource` of the same set; run `job unit -- npm test -- --maxWorkers=2 test/domain/typst`; expect FAIL.
- [ ] Write it; run; expect PASS; both files under 150 lines.
- [ ] Commit.

#### Task D3: the rounds (lane C, after D2)

**Files:** `src/domain/typst/rounds.ts` (new), `test/domain/typst/rounds.test.ts` (new).
**Interfaces:** `Diagnostic`, `nextShape` (R12), answering `Shape | 'draft' | 'file'`; `'file'` ends the rounds with R18's file line.

- [ ] Write the tests: an error on a wrapped proposal's line unwraps it alone; an error on an unwrapped proposal's line omits it alone; an error with `line: null` unwraps all, then omits all unwrapped ones, then answers `'draft'`; a warning alone answers the shape unchanged; an error whose message contains "file not found" or "failed to load file" answers `'file'` whatever its line; run; expect FAIL.
- [ ] Write it; run; expect PASS.
- [ ] Commit.

### Lane W: the worker

#### Task W1: the compiler in a worker, and gate G1 (lane W, first; Sonnet or, after 16:11, Codex at medium)

**Files:** `package.json`, `package-lock.json` (exact `"@myriaddreamin/typst-ts-web-compiler": "0.7.0"`, imported as `@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler.mjs`, R3), `scripts/build.mjs`, `knip.json` and `.dependency-cruiser.cjs` if the new entry needs listing, `src/adapters/typst/protocol.ts`, `src/adapters/typst/worker-entry.ts`, `src/adapters/typst/compiler.ts` (all new), `fonts/` (17 files and `NOTICE`, R5), `test/adapters/typst/protocol.test.ts`, `test/adapters/typst/compiler.test.ts`, `test/structure/fonts.test.ts` (new), `test/structure/no-eval.test.ts` (asserts `js/typst.worker.js` exists), `scripts/typst-smoke.mjs` (new), `js/typst.worker.js`, `js/typst-compiler.wasm`.
**Interfaces:** R2 to R6, `CompilerPort`, `CompileJob`, `CompileResult`; the protocol takes `{ type: 'compile', id, job }` and answers `{ id, pdf, diagnostics, ms }` with the PDF's buffer transferred; first use initialises the glue from the wasm bytes and adds the 17 fonts; each compile calls `reset_shadow`, maps each of the job's sources and files under `/` plus its own path, compiles `/` plus `job.main` to PDF, and calls `evict_cache(30)` (guarded, for 0.7.0 has none).

- [ ] Write the tests with a fake compiler object: initialisation once for two jobs; shadow reset, sources and files mapped under `/` plus their own paths, `job.main` compiled with a draft beside a `main.typ` it includes (no collision), and `evict_cache` per job; a thrown compile answering its diagnostics with lines; a font or wasm fetch failure answering `{ failed: 'start' }`; the adapter creating no worker until the first `compile`; `fonts.test.ts` pinning the 17 names and sha256 sums; run `job unit -- npm test -- --maxWorkers=2 test/adapters/typst test/structure`; expect FAIL.
- [ ] Write the modules and the build (R3's plugin on the glue module throws unless it replaced exactly two bodies; R24's wasm copy and version define); build; expect PASS, including `no-eval.test.ts`.
- [ ] **Gate G1.** `scripts/typst-smoke.mjs` opens a route-mocked page (Playwright Chromium, headless, `http://gloss.invalid`, every other host aborted and counted) that loads only `js/typst.worker.js`, the wasm, and the fonts, and compiles: the X1 fixture with `references.bib`, which must give a PDF whose pdf.js text holds both APA citations and the reference list; a source with an unclosed `$`, which must give an error diagnostic with a line; `#set text(font: "Nonexistent Sans")`, which must give the "unknown font family" warning (a successful compile returns no diagnostics, so the worker takes warnings from compiling the snapshot world); `#sys.version`, whose text is recorded for R26 (0.14.2 on 0.7.0); and `#import "@preview/example:0.1.0"`, which must fail without any request leaving `gloss.invalid`; it prints each compile's `ms` and the count of aborted requests, which must be 0.
  Run it through `job smoke -- node scripts/typst-smoke.mjs`; paste its output into the commit message.
  0.7.0 is tried first; the rc (Typst 0.15.1) is used only if 0.7.0 cannot compile the fixtures or the 0.15 syntax the plan names, and the failing construct is recorded for R26; if both fail, stop and report to the session at once (the fallback release).
- [ ] Commit.

#### Task V1: showing PDF bytes, keeping the scroll position, and the margin bar (lane W, after O2 and its merge)

**Files:** `src/adapters/pdfjs/pdf-view.ts`, `src/adapters/pdfjs/pdf-doc.ts` (new, the document loading and page building moved out of `pdf-view.ts`, owning the loading task and the observers it creates), `src/adapters/pdfjs/mark-draw.ts`, `css/review.css` (`.gr-pdf-margin`), `src/app/ports.ts` (`showBytes`, the `margin` mark), `test/adapters/pdfjs/pdf-view.test.ts`, `test/adapters/pdfjs/mark-draw.test.ts`, `test/structure/size.test.ts`, `test/app/fakes.ts`.
**Interfaces:** R17, R19's drawing; after the merge of `pdf-overlay` at O2; `pdf-view.ts` drops below its 216-line baseline and the task lowers or removes the entry.

- [ ] Write the tests with pdf.js faked as `pdf-view.test.ts` does: `showBytes` loads `{ data }`, replaces the pages, resolves the new text items, and keeps `scrollTop` (clamped when the new document is shorter); `show()` after `showBytes` loads the uploaded PDF again; `showBytes` destroys the previous loading task (the fake's `destroy` is called) and disconnects its observers, and draws the visible pages before the container's children are swapped; a `margin` mark draws one bar per page spanning its rectangles' height at the text column's left; run `job unit -- npm test -- --maxWorkers=2 test/adapters/pdfjs`; expect FAIL.
- [ ] Write it; run; expect PASS; build.
- [ ] Commit.

### Lane A: the session

#### Task A1: three looks and the quiet line (lane A, after O1's merge; UI by its tests, pictures in X2)

**Files:** `src/app/view.ts`, `src/app/pdf-marks.ts` (`setPdfLook` clears `pdfCache` and the scheduled signature, and `place()` keeps only `note` marks for look `original`), `src/app/session-state.ts`, `src/adapters/storage/browser-store.ts` (reads `original`, refuses unknown values), `src/ui/head.tsx`, `src/ui/panel-model.ts` (builds a HeadView, `:31`), `css/review.css` (`.gr-pdf-note-line`), `test/app/pdf-marks.test.ts`, `test/adapters/storage/browser-store.test.ts`, `test/ui/islands.test.ts`.
**Interfaces:** `PdfLook`, `HeadView.pdfNote`, R15's switch order "Original", "Changes", "New text" (`aria-label` "PDF shows" kept).

- [ ] Write the tests: the switch's three buttons with `aria-pressed`; "Original" places only comment highlights on a fresh session, and a live switch Changes, then Original, then Changes counts the marks of each kind (struck and insert marks gone on Original, back on Changes); a stored `original` survives a reload and a stored `'blue'` gives the default; `pdfNote` renders beside the switch and nothing when empty; run `job unit -- npm test -- --maxWorkers=2 test/app/pdf-marks.test.ts test/adapters/storage test/ui/islands.test.ts`; expect FAIL.
- [ ] Write it; run; expect PASS; build.
- [ ] Commit.

#### Task A2: the compile pipeline (lane A, after A1, D3, F2, V1, and W1)

**Files:** `src/app/compiled-pdf.ts` (new), `src/app/compile-messages.ts` (new, R18's lines), `src/app/pdf-marks.ts` (`PdfMarks.showBytes(bytes)` over `ports.pdf.showBytes`, V1's member, replacing `pdfIndex` and clearing `pdfCache` and the signature), `src/app/ports.ts` (`Ports.compiler`), `src/app/lifecycle.ts`, `src/app/session.ts` (calls `request` after edits and on look or view switches), `src/main.ts` (wires `createTypstCompiler` for Typst drafts), `test/app/compiled-pdf.test.ts` (new), `test/app/pdf-marks.test.ts`, `test/app/fakes.ts`.
**Interfaces:** `CompiledPdf` (R16, R18); inputs: `importsPackage` on the main text and on every read `.typ` file's `text` from `api.file` (then the package line, no compile), `typstReads` followed recursively through read `.typ` files with at most 64 files, each fetched once per page load through `api.file` (a `null`, or a `.typ` whose `text` is `null`, gives the file line); the rounds of R12 through `nextShape`, `'file'` giving the file line, `'draft'` the unchanged draft whose success is shown with every proposal left out, and a round sequence abandoned when a newer request waits; a `{ failed: 'start' }` gives the compiler line and no further compiles until reload; any warning with "unknown font family" gives the font line.

- [ ] Write the tests with a fake `CompilerPort` and the fake scheduler: one compile 600 ms after three edits; an edit during a compile queues one, and the older result is not shown; a look switch compiles at once; the editor view compiles nothing; each of R18's lines from its cause, with the uploaded PDF and its overlay shown; the rounds stopping at four compiles; a "file not found" diagnostic giving the file line at once; round 4 compiling shows its PDF with every card "Not shown on the PDF." and no fallback; a round sequence issuing no further compile when a newer request arrives; `PdfMarks.showBytes` clearing the placed marks; a read file fetched once across two compiles; run `job unit -- npm test -- --maxWorkers=2 test/app/compiled-pdf.test.ts`; expect FAIL.
- [ ] Write it; run; expect PASS; build.
- [ ] Commit.

#### Task A3: the compiled document's marks, selection, and card line (lane A, after A2)

**Files:** `src/app/compiled-doc.ts` (new), `src/app/compiled-pdf.ts`, `src/app/session.ts` (`onSelect` through `s.pdfDoc`), `src/app/pdf-marks.ts` (`place()` matches against `s.pdfDoc.source`; the document's owner, R20), `src/app/session-state.ts`, `src/app/presenter.ts`, `src/app/view.ts` (`CardView.unmarked`), `src/ui/card.tsx`, `css/review.css` (`.gr-unmarked` like `.gr-off-pdf`), `test/app/compiled-doc.test.ts` (new), `test/app/pdf-marks.test.ts`, `test/app/session.test.ts`, `test/app/presenter.test.ts`, `test/ui/islands.test.ts`.
**Interfaces:** `PdfDoc`, R14, R19, R20; after `showBytes`, `pdfDoc` is the generated source's `sourceKey` (ops from `parseTypst(g.text)`) and `toDraft`; comments get `note` marks and unmarked proposals `margin` marks; omitted proposals join `offPdf`.

- [ ] Write the tests: a selection on the compiled "Changes" text of copied words, of old words, and of new words opens the form on the right draft range; the same on "New text"; on "Original" as today; a comment's highlight placed on the compiled page; an unmarked proposal's card line and its `margin` mark; an omitted one's "Not shown on the PDF."; a comment placed on Changes is placed again on the recompiled document after an edit (the highlight on the new document's item indexes, none left on the old ones), and after a switch to Original and back; run `job unit -- npm test -- --maxWorkers=2 test/app test/ui/islands.test.ts`; expect FAIL.
- [ ] Write it; run; expect PASS; build.
- [ ] Commit.

### Lane X: pictures and numbers

#### Task X2: the route-mocked pictures (lane X, after A3; UI; Sonnet on MewTwo)

**Files:** `scripts/shots/synthetic.mjs` (folder `Typst`; routes for `/typst.worker.js`, `/typst-compiler.wasm`, `/fonts/*`, and `/file?path=` served from the fixture folder, refusing what R8 refuses), `scripts/shots/scenes.mjs` (scene `typst-compile`, scene `typst-fallback` on `package.typ`), `scripts/shots.mjs` if a folder needs mapping, `test/scripts/synthetic.test.mjs`, `test/scripts/scenes.test.mjs`.
**Interfaces:** `typst-compile`: in the editor, a replacement and an insertion in paragraphs, a replacement across the soft line break, one in a heading, one in the equation, one in the `#underline` argument, and a comment; then the PDF view in "Changes", "New text", and "Original", one picture each per theme; its checks read `.gr-status`, `pdfNote`, the cards' `gr-unmarked` lines, ink in the compiled canvas, and a selection on "New text" opening the form; `typst-fallback`: the package line and the overlay's struck marks.

- [ ] Write the synthetic-route tests (the new routes, a `../` file request refused); run `job unit -- npm test -- --maxWorkers=2 test/scripts`; expect FAIL; write it; expect PASS.
- [ ] Run `job shots -- node scripts/shots.mjs typst-compile --fixture synthetic`, then `typst-fallback`, `latex-proposals`, and `pdf-proposals` the same way, in Chromium, then Firefox and WebKit for `typst-compile`; look at every picture; hand checks H1 to H6.
- [ ] Commit, naming what each picture shows.

#### Task M: compile times at 10,000 lines (lane X, after A2; may run beside X2)

**Files:** `scripts/measure-compile.mjs` (new), `test/scripts/measure-compile.test.mjs` (new, the argument parsing and report format only).
**Interfaces:** a route-mocked page as X2's with the `longDraft()` text as `long.typ` and a review of 2,000 proposals spread evenly (the script writes the format-1 JSON), read from the compiler adapter's `ms` through `ports.diagnostic` messages on the console; it reports the first compile (with the download and fonts), then five recompiles after a one-word edit, for "Changes" and "New text", best and median.

- [ ] Write the test; expect FAIL; write the script; expect PASS.
- [ ] Run `job measure -- node scripts/measure-compile.mjs`; put the numbers into PDFDIFF-1 (task R) and the commit message.
- [ ] Commit.

### Release (session)

#### Task L: the laptop's live check on 8090

The session sends the live-check brief below with the READY; MewTwo has no Docker.

#### Task R: decision, notices, package, version (on `pdf-compile`)

**Files:** `docs/decisions.md` (PDFDIFF-1 and the PDFP-1 line, R26), `notices/` (R25), `scripts/third-party.mjs`, `THIRD-PARTY.md`, `scripts/package.sh`, `test/structure/package.test.ts`, `appinfo/info.xml`, and the bundles under `js/`, rebuilt because the version is defined into the page bundle (R24).

- [ ] Change the allowlist test and the expected version to 0.2.0; give the test's `fixture()` small placeholder files in place of the large allowlisted ones (`js/typst-compiler.wasm`, `fonts/*`, same names), and the reproducible test an explicit timeout, since the real wasm and fonts cost about 1.75 s per fixture and the reproducible test archives twice (plan review I6); run `job unit -- npm test -- --maxWorkers=2 test/structure/package.test.ts`; expect FAIL; change `package.sh` and `info.xml`; expect PASS.
- [ ] Write PDFDIFF-1 (R1 to R5 and R7 in your words, the Typst checkout hash from G1, the measured times of task M, the archive size); rewrite PDFP-1's last line in place.
- [ ] `node scripts/third-party.mjs`; `job build -- npm run build`; `job check -- npm run check -- -- --maxWorkers=2`; commit; `scripts/package.sh`; `sha256sum` and `stat -c %s` of the real archive, measured once outside the test suite, which must be under 31,457,280 bytes; the numbers go into the READY.

#### Task Q: the fallback release (on `pdf-overlay`; only if the checkpoint or the cut line falls back)

**Files:** `appinfo/info.xml`, `test/structure/package.test.ts` (the expected version, `:72`).
**Interfaces:** R27; `pdf-overlay` as merged after O2, with no file of lane C, W, or A.

- [ ] Change the expected version to 0.1.2; run `job unit -- npm test -- --maxWorkers=2 test/structure/package.test.ts`; expect FAIL; change `info.xml`; expect PASS.
- [ ] `job check -- npm run check -- -- --maxWorkers=2`; commit and push `pdf-overlay`; `scripts/package.sh`; `sha256sum` and `stat -c %s` of the archive; the numbers go into the READY, which says the release is the overlay fixes alone.

## Order and lanes

| Lane | Tasks, in order |
| --- | --- |
| O, overlay fixes, on `pdf-overlay` | O1, O2 (after O1); the session merges the branch into `pdf-compile` after each |
| F, server and fetch | F1, F2 (no dependency) |
| C, domain | X1, D1 (after X1), D2 (after D1), D3 (after D2) |
| W, worker and view | W1 (after X1), V1 (after O2's merge) |
| A, session | A1 (after O1's merge), A2 (after A1, D3, F2, V1, and W1), A3 (after A2) |
| X, pictures and numbers | X2 (after A3), M (after A2) |
| Release | L and R after X2 and M, on `pdf-compile`; Q on `pdf-overlay` only on the fallback |

At most two task sessions build at once (two slots); the first pair is O1 with X1, then W1 with D1 (G1 gates Monday 22:00); O2, D2, V1, D3, F2, and F1 follow in the free slots, F1 needing only CI.
A2 waits on every arm: lane C's D3 and F2, lane W's W1, and lane O's O1 and O2 through V1.
The critical path is the longest of X1, D1, D2, D3; X1, W1; and O1, O2, V1 (each after its merge), then A2, A3, X2, R; with two slots the arms cannot all run at once, and lane O's two UI tasks with their hand checks are the likelier long arm, so O2 takes the first free slot after W1 and D1.
Two sessions pushing to `pdf-compile` rebase and rebuild the bundles each time, and a CI run is read by the commit's SHA (`gh run list --commit <sha>`), not by the branch's latest run; this holds for F1's red and green runs above all.

File clashes, so tasks sharing a file never run at once:

| Shared file | Tasks | How they are kept apart |
| --- | --- | --- |
| `src/adapters/pdfjs/mark-draw.ts`, its test | O1, O2, V1 | in that order; V1 after O2's merge |
| `src/adapters/pdfjs/pdf-view.ts`, its test | O2, V1 | V1 after O2's merge |
| `test/structure/size.test.ts` | D1, V1 | separate baseline entries, a text merge |
| `css/review.css` | O1, V1, A1, A3 | O1 first; the rest touch separate rules, a text merge |
| `docs/decisions.md` | O1, R | O1 writes PDFLBL-1 on `pdf-overlay`, R writes PDFDIFF-1 after it on `pdf-compile` |
| `src/app/ports.ts`, `test/app/fakes.ts` | F2, V1, A2 | F2 and V1 can overlap (separate members, a text merge); A2 after both |
| `src/app/pdf-marks.ts`, `test/app/pdf-marks.test.ts` | A1, A2, A3 | lane A, in order |
| `src/app/view.ts`, `session-state.ts`, `presenter.ts`, `test/ui/islands.test.ts` | A1, A3 | lane A, in order |
| `src/app/session.ts`, `src/app/compiled-pdf.ts` | A2, A3 | lane A, in order |
| `src/domain/source/typst-parse.ts`, `src/domain/review/draft-review.ts` | D1, D2 | each task owns one; no other task edits either |
| `scripts/shots/synthetic.mjs`, `scenes.mjs` | O1, X2 | X2 long after O1 |
| `appinfo/info.xml`, `test/structure/package.test.ts` | Q, R | Q on `pdf-overlay`, R on `pdf-compile`; `pdf-overlay` is never merged after Q |
| `js/*` bundles | every task changing `src/`, `css/`, or the build | each rebuilds after merging the previous task or after a merge of `pdf-overlay` (0.1.1's R19 rule: a bundle conflict is settled by rebuilding, never by hand) |

**Gate, Monday 2026-11-16 at 22:00:** G1 passed with one pinned version; if not, the session reports that the compile route cannot be made safe in time, and lanes C, W, A, and X stop.
**Checkpoint, Tuesday 2026-11-17 at 13:00:** A2 merged; if not, the release is the fallback release (R27, task Q: `pdf-overlay` at 0.1.2) and the compile route continues on its branch.
**Cut line, Tuesday 2026-11-17 at 17:00:** X2's pictures looked at and the review passed; if not, the same fallback.
READY is `pdf-compile` after task R, on Tuesday evening, or `pdf-overlay` after task Q.

## Hand checks

Each picture in light and dark, through `node scripts/shots.mjs <scene> --fixture synthetic` under `job`; the builder looks at both and names what each shows.

- **H1, Changes (Typst).** The paragraph reflowed with "old" in red strike-through and "new" green-underlined beside it, the soft-line-break proposal across both lines, the heading's change inside the heading, APA citations and the reference list as `typst compile` prints them, the footnote; the equation and argument proposals plain, with a green bar in the left margin where placed and their card lines.
- **H2, New text (Typst).** The new words in light yellow, no deleted words, the layout reflowed; the comment's yellow highlight on its words.
- **H3, Original (Typst).** The uploaded `paper.pdf`, the comment's highlight, no proposal marks, no quiet line.
- **H4, fallback.** `typst-fallback`: the uploaded PDF with 0.1.1's struck marks and carets and the line "Showing your PDF; the draft uses a package the browser cannot load."; never an empty PDF area.
- **H5, LaTeX.** Carets without words, the words shown on hover by moving the mouse over the caret, not by `focus()`; New text words matching the line's serif, bold, and italic; Chromium, Firefox, and WebKit.
- **H6, the switch.** The pressed look and view buttons plainly pressed in both themes.
- **H7, scroll.** After an edit on page 2 of "Changes", the recompiled page 2 still in view.

## Live-check brief for the laptop (8090, with the READY)

1. `scripts/dev-nc.sh reset` (route change), then open the `Typst` link in Chromium and Firefox, light and dark.
2. In the browser's network panel: `typst.worker.js`, `typst-compiler.wasm` (`application/wasm`), and the fonts load from the instance on the first "Changes", each URL carrying `?v=<version>`, and nothing from any other host; the console shows no CSP violation (R4).
3. The six proposals of scene `typst-compile` made by hand; H1 to H3 and H7 on the real instance.
4. `curl` against `/r/<token>/file?path=` with `references.bib` (200), `../Typst%20reviews/x.json`, `.gloss-review`, and `%2Fetc%2Fpasswd` (each 404); the password-protected link unauthenticated (404).
5. The `Latex` link: H5 and H6.
6. `scripts/php.sh test` and `scripts/php.sh lint` green.

## Not in this plan

- Typst packages from `@preview` or `@local`: such a draft falls back (rule 5).
- Interrupting a running compile; very long drafts wait for it (R16, task M's numbers).
- Proposals in files other than the main one; drafts are single-file today (FORMAT-1, `docs/decisions.md:60`).
- Loading fonts per family; all 17 load on first use (R5).
- A server-derived list of read files (R7).
- The embedded PDF font for drawn overlay words; R22 takes family, weight, and slant only.
- 0.1.1's parked items: caret and callout overlap, readback caching, page-straddling replacements, and the LaTeX ops flash (`~/.cache/gloss-work/pdfprop/park.md`).

## Question for you

None; every option question is ruled above, and the brief settled the value questions (rulings 1 to 7).
