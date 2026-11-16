# Working on gloss for Nextcloud

Keep changes within the assigned task's file scope and checklist.
The architecture described here is implemented and enforced by the checks below.
Use test-first development: run each new test and see it fail before writing its implementation.
Keep fixtures synthetic, and keep changes within the assigned task.

## Commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Install locked dependencies |
| `npm run build` | Build the committed application, worker, and PDF text-layer CSS |
| `npm run typecheck` | Check strict TypeScript under both normal and pure configurations |
| `npm run structure` | Run dependency-cruiser and knip |
| `npm test -- --maxWorkers=2` | Run Vitest with two workers on this machine |
| `npm run check` | Build, typecheck, structure, and unit tests |
| `scripts/php.sh test` | Run PHPUnit in Docker |
| `scripts/php.sh lint` | Run PHP syntax checks in Docker |
| `scripts/dev-nc.sh up` | Start the disposable Nextcloud |
| `scripts/dev-nc.sh reset` | Restart it after route changes |
| `scripts/dev-nc.sh down` | Stop it |
| `node scripts/shots.mjs <scene>` | Capture a scene in light and dark themes |

There is no PHP on this machine: run PHP, Composer, and PHPUnit in official PHP or Composer Docker images with the repository mounted and `--rm`, through the repository script where available.
Run heavy jobs, including npm dependency installation, Vitest, Playwright, and Docker builds, through the heavy-job wrapper with `HEAVY_MODE=none`.
For example, from the repository root:

```bash
HEAVY_MODE=none $GLOSS_WORK/../../tools/heavy-job.sh start /tmp/gloss-jobs unit -- npm test -- --maxWorkers=2
$GLOSS_WORK/../../tools/heavy-job.sh wait /tmp/gloss-jobs unit
HEAVY_MODE=none $GLOSS_WORK/../../tools/heavy-job.sh start /tmp/gloss-jobs check -- npm run check
$GLOSS_WORK/../../tools/heavy-job.sh wait /tmp/gloss-jobs check
```

Use the same start/wait pattern for `npm ci` or `npm install`.
The `test` script fixes no worker count; callers choose one, and CI uses Vitest's default.
Inspect the job's exit result, and repeat wait if it is still running.
For UI work, inspect light and dark pictures before calling the task done; PDF and Both scenes also run in Firefox and WebKit.
Commit generated bundles alongside source changes; CI rebuilds and checks for a diff.
Do not bump `appinfo/info.xml` outside the release archive task.

## Layers and purity

Apply R2 with errors, never warnings, and allow no dependency cycles.

- `src/domain/` imports only domain code and no npm package.
- `src/app/` imports only app and domain code.
- `src/adapters/` imports app, domain, and npm packages, never UI.
- `src/ui/` imports app, domain, Preact, and `@preact/signals`, never adapters.
- `src/main.ts` is wiring only, and nothing imports it.

Domain and app compile with `lib: ["ES2023"]` and no DOM.
Their source must not use `Date`, `Math.random`, `crypto`, `setTimeout`, `localStorage`, `window`, or `document`.
Time and ids are parameters; browser capabilities come through the app's ports.
Run both TypeScript configurations, dependency-cruiser, knip, and the purity tests.
Keep HTTP in the controller and file-system decisions in services behind OCP interfaces.

## Islands

Apply R8, R37, and R42: Preact owns the header content in `header.gr-head` and the side panel in `aside.gr-side`.
Hand-built editor and PDF code writes only into `#gr-text` and `#gr-pdf`, outside island ownership.
Construct the UI-owned `PanelModel` before `ReviewSession` and pass it as `PanelPort`.
Use a keyed `Card` per item reading its own signal, separate order and count signals, and fine-grained `upsertCard`, `removeCard`, `setOrder`, `setCount`, and `setHead` calls.
On each keystroke, the panel redraws only changed cards.
Place PDF marks after 400 ms without typing, only while the PDF shows, and only for items whose words changed.

## Hard rules

Never read real credentials or put secrets in files or environment variables.
Generated test credentials belong only in gitignored files and must never be printed.
Never read `.local-nc.env` or `.dev-nc.env` into a session, source them, or print them.
Use synthetic fixtures only, with no text from the author's real paper.
Never read, store, use, or otherwise touch a signing key.
Never run the real `claude` or `codex` executables.
Never touch `~/.codex` or the keyring, and never run `git stash`.
Use Docker Nextcloud only through `scripts/dev-nc.sh`, container `gloss-dev-nc`, and port 8090.
Do not operate container `gloss-nc`, port 8089, or `.local-nc.env`.
Never touch `main`; commit only explicit task paths and push the task branch after every commit.
Use the required commit identity and trailer:

```bash
git -c user.name="Svenja Kernig" -c user.email=20756868+Kiibou-chan@users.noreply.github.com commit README.md CLAUDE.md docs/decisions.md -m "Document the review architecture and decisions" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
git push origin HEAD
```

Write UI text and Markdown in British English, with Oxford commas, no em-dashes, and one sentence per line.
