import { chromium, firefox, webkit } from '@playwright/test';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { scenes } from './shots/scenes.mjs';

export { scenes };

async function main() {
  const [sceneName, ...args] = process.argv.slice(2);
  const scene = scenes[sceneName];
  if (!scene) throw new Error(`Choose a scene: ${Object.keys(scenes).join(', ')}.`);
  let out = 'shots';
  let browserName = 'chromium';
  let fixture = false;
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i + 1]) throw new Error('An option is missing its value.');
    if (args[i] === '--out') out = args[i + 1];
    else if (args[i] === '--browser') browserName = args[i + 1];
    else if (args[i] === '--fixture' && args[i + 1] === 'synthetic' && ['overall', 'review-link'].includes(sceneName)) fixture = true;
    else throw new Error('Unknown screenshot option.');
  }
  const browserType = { chromium, firefox, webkit }[browserName];
  if (!browserType) throw new Error('Choose chromium, firefox, or webkit.');
  let state;
  if (fixture) {
    state = { base: 'http://gloss.invalid', links: { Review: 'http://gloss.invalid/index.php/apps/gloss/r/synthetic' } };
  } else {
    // This is the generated, ignored fixture state, never the real instance's credentials.
    const script = new URL('./dev-nc.sh', import.meta.url);
    // Container runners sync on the host before starting, without a Docker socket.
    if (process.env.GLOSS_SHOTS_SKIP_SYNC !== '1') {
      execFileSync(script.pathname, ['sync'], { stdio: ['ignore', 'ignore', 'ignore'] });
    }
    if (((await stat(new URL('../.dev-nc.env', import.meta.url))).mode & 0o077) !== 0) throw new Error('Development state must be owner-only.');
    state = JSON.parse(await readFile(new URL('../.dev-nc.env', import.meta.url), 'utf8'));
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(state.base) || new URL(state.base).port === '8089') {
      throw new Error('The screenshot runner requires the disposable local instance.');
    }
  }
  const folder = scene.folder ?? 'Review';
  const url = state.links[folder];
  if (!url?.startsWith(`${state.base}/index.php/apps/gloss/r/`)) throw new Error('Fixture link missing; run scripts/dev-nc.sh up.');
  await mkdir(out, { recursive: true });
  const reviews = new Map();
  const browser = await browserType.launch({ headless: true });
  try {
    for (const colour of ['light', 'dark']) {
      if (!fixture) execFileSync(new URL('./dev-nc.sh', import.meta.url).pathname, ['empty-reviews'], { stdio: ['ignore', 'ignore', 'ignore'] });
      const options = { colorScheme: colour, viewport: { width: 1600, height: 1000 } };
      const context = await browser.newContext(options);
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(15_000);
        const prefix = `${sceneName}${browserName === 'chromium' ? '' : `-${browserName}`}-${colour}`;
        const capture = async (suffix = '', target = page) => {
          await target.bringToFront();
          // Let the browser paint after focus and layout changes before photographing a canvas.
          await target.evaluate(() => new Promise(resolvePaint => requestAnimationFrame(() => requestAnimationFrame(resolvePaint))));
          await target.screenshot({ path: resolve(out, `${prefix}${suffix}.png`), fullPage: true });
          console.log(`Wrote ${prefix}${suffix}.png`);
        };
        const prepareSynthetic = fixture ? target => syntheticOverall(target, sceneName, reviews) : undefined;
        if (fixture) await prepareSynthetic(context);
        await page.goto(url, { waitUntil: 'networkidle' });
        try {
          await scene.run({ page, context, browser, options, state, capture, out, prefix, prepareSynthetic });
        } catch (error) {
          if (scene.requires) console.error(`Scene needs feature ${scene.requires} and its specified behaviour.`);
          throw error;
        }
        await capture();
        if (fixture && sceneName === 'overall') {
          await page.getByRole('button', { name: 'Send review', exact: true }).click();
          await page.getByRole('status').getByText('Review sent. Thank you.', { exact: true }).waitFor();
          if (!await page.locator('.gr-overall-text').count() || await page.locator('#gr-overall').count()) throw new Error('Sent overall comment must be plain text.');
          await capture('-sent');
        }
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
}

async function syntheticOverall(context, sceneName, reviews) {
  const script = await readFile(new URL('../js/gloss-review.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../css/review.css', import.meta.url), 'utf8');
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Synthetic review fixture</title>
    <style>
      :root { color-scheme: light dark; --color-main-background: #fff; --color-main-text: #222; --color-text-maxcontrast: #555; --color-border: #bbb; --color-background-hover: #eee; --color-primary-element: #006da3; --color-primary-element-light: #d9edf8; --border-radius: 6px; --border-radius-large: 10px; }
      @media (prefers-color-scheme: dark) { :root { --color-main-background: #181818; --color-main-text: #eee; --color-text-maxcontrast: #bbb; --color-border: #666; --color-background-hover: #292929; --color-primary-element: #80cfff; --color-primary-element-light: #244459; } }
      body { margin: 32px; font: 16px/1.5 system-ui; background: var(--color-main-background); color: var(--color-main-text); }
      input, textarea, button { box-sizing: border-box; font: inherit; padding: 8px; color: inherit; background: var(--color-main-background); border: 1px solid var(--color-border); border-radius: 6px; }
      label { display: flex; flex-direction: column; } button:enabled { cursor: pointer; } button:disabled { opacity: .5; }
      ${css}
    </style><body><p>Synthetic ${sceneName} fixture, with the application bundle and simulated API.</p>
    <div id="gloss-review" data-token="synthetic" data-reviewable="1" data-has-pdf="0" data-view="editor">
      <header class="gr-head"></header><main class="gr-body"><article id="gr-text" class="gr-text"></article><article id="gr-pdf" class="gr-pdf" hidden></article><aside class="gr-side"></aside></main>
    </div><script src="/gloss-review.js"></script></body></html>`;
  await context.route('http://gloss.invalid/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/gloss-review.js') return route.fulfill({ contentType: 'text/javascript', body: script });
    if (path.endsWith('/draft')) return route.fulfill({ json: { main: 'garden.txt', files: [{ file: 'garden.txt', text: 'Synthetic garden observations.\nThe seedlings grow beside the window.\n', etag: 'synthetic-v1' }] } });
    if (path.endsWith('/review/open')) {
      const params = new URLSearchParams(route.request().postData() ?? '');
      const review = reviews.get(params.get('key')) ?? null;
      return route.fulfill({ json: review ? { review, revision: review.revision } : { review: null } });
    }
    if (path.endsWith('/review')) {
      const params = new URLSearchParams(route.request().postData() ?? '');
      const review = JSON.parse(params.get('review'));
      reviews.set(params.get('key'), review);
      return route.fulfill({ json: { revision: Number(params.get('baseRevision')) + 1 } });
    }
    if (path.endsWith('/synthetic')) return route.fulfill({ contentType: 'text/html', body: html });
    return route.abort();
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Playwright's verbose errors can contain credential-bearing request or form data.
  main().catch(error => {
    if (/^Scene needs feature [A-Z0-9a-z ,.]+\.$/.test(error.message)) console.error(error.message);
    for (const frame of (error.stack ?? '').split('\n').filter(line => /^\s+at .*scripts\//.test(line))) console.error(frame);
    console.error('Screenshot failed: check the scene prerequisites, disposable server, and installed Playwright browsers.');
    process.exitCode = 1;
  });
}
