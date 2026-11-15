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
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i + 1]) throw new Error('An option is missing its value.');
    if (args[i] === '--out') out = args[i + 1];
    else if (args[i] === '--browser') browserName = args[i + 1];
    else throw new Error('Unknown screenshot option.');
  }
  const browserType = { chromium, firefox, webkit }[browserName];
  if (!browserType) throw new Error('Choose chromium, firefox, or webkit.');
  // This is the generated, ignored fixture state, never the real instance's credentials.
  const script = new URL('./dev-nc.sh', import.meta.url);
  // Container runners sync on the host before starting, without a Docker socket.
  if (process.env.GLOSS_SHOTS_SKIP_SYNC !== '1') {
    execFileSync(script.pathname, ['sync'], { stdio: ['ignore', 'ignore', 'ignore'] });
  }
  if (((await stat(new URL('../.dev-nc.env', import.meta.url))).mode & 0o077) !== 0) throw new Error('Development state must be owner-only.');
  const state = JSON.parse(await readFile(new URL('../.dev-nc.env', import.meta.url), 'utf8'));
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(state.base) || new URL(state.base).port === '8089') {
    throw new Error('The screenshot runner requires the disposable local instance.');
  }
  const folder = scene.folder ?? 'Review';
  const url = state.links[folder];
  if (!url?.startsWith(`${state.base}/index.php/apps/gloss/r/`)) throw new Error('Fixture link missing; run scripts/dev-nc.sh up.');
  await mkdir(out, { recursive: true });
  const browser = await browserType.launch({ headless: true });
  try {
    for (const colour of ['light', 'dark']) {
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
        await page.goto(url, { waitUntil: 'networkidle' });
        try {
          await scene.run({ page, context, browser, options, state, capture, out, prefix });
        } catch (error) {
          if (scene.requires) console.error(`Scene needs feature ${scene.requires} and its specified behaviour.`);
          throw error;
        }
        await capture();
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
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
