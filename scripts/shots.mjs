import { chromium, firefox, webkit } from '@playwright/test';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { scenes } from './shots/scenes.mjs';
import { syntheticRoutes, syntheticScenes } from './shots/synthetic.mjs';

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
    else if (args[i] === '--fixture' && args[i + 1] === 'synthetic' && syntheticScenes.includes(sceneName)) fixture = true;
    else throw new Error('Unknown screenshot option.');
  }
  const browserType = { chromium, firefox, webkit }[browserName];
  if (!browserType) throw new Error('Choose chromium, firefox, or webkit.');
  let state;
  if (fixture) {
    const link = 'http://gloss.invalid/index.php/apps/gloss/r/synthetic';
    state = { base: 'http://gloss.invalid', links: { Review: link, Latex: link } };
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
  const results = [];
  const browser = await browserType.launch({ headless: true });
  try {
    for (const colour of ['light', 'dark']) {
      if (!fixture) execFileSync(new URL('./dev-nc.sh', import.meta.url).pathname, ['empty-reviews'], { stdio: ['ignore', 'ignore', 'ignore'] });
      const options = { colorScheme: colour, viewport: { width: 1600, height: 1000 } };
      const context = await browser.newContext(options);
      const shots = [];
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(15_000);
        const prefix = `${sceneName}${browserName === 'chromium' ? '' : `-${browserName}`}-${colour}`;
        const capture = async (suffix = '', target = page) => {
          await target.bringToFront();
          // Let the browser paint after focus and layout changes before photographing a canvas.
          await target.evaluate(() => new Promise(resolvePaint => requestAnimationFrame(() => requestAnimationFrame(resolvePaint))));
          const probe = await target.evaluate(() => {
            const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom }; };
            return {
              viewport: { width: innerWidth, height: innerHeight },
              status: document.querySelector('.gr-status')?.textContent,
              editorStyle: [...document.querySelectorAll('.cm-content')].map(element => ({ color: getComputedStyle(element).color, opacity: getComputedStyle(element).opacity, background: getComputedStyle(element).backgroundColor, editable: element.contentEditable })),
              editorAncestors: [...document.querySelectorAll('.cm-content')].flatMap(element => { const ancestors = []; for (let node = element.parentElement; node && ancestors.length < 7; node = node.parentElement) ancestors.push({ tag: node.tagName, class: node.className, opacity: getComputedStyle(node).opacity, overflow: getComputedStyle(node).overflow, ...rect(node) }); return ancestors; }),
              footer: [...document.querySelectorAll('footer')].map(rect),
              cards: [...document.querySelectorAll('.gr-items > li')].map(rect),
              panel: [...document.querySelectorAll('.gr-side')].map(rect),
              pdf: [...document.querySelectorAll('#gr-pdf canvas')].map(canvas => {
                const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
                let ink = 0;
                for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] && pixels[i] < 180 && pixels[i + 1] < 180 && pixels[i + 2] < 180) ink++;
                return { ...rect(canvas), widthPixels: canvas.width, heightPixels: canvas.height, inkPixels: ink };
              }),
              pdfLayers: [...document.querySelectorAll('#gr-pdf canvas, #gr-pdf .textLayer, #gr-pdf .gr-page')].map(element => ({ class: element.className, tag: element.tagName, opacity: getComputedStyle(element).opacity, background: getComputedStyle(element).backgroundColor, filter: getComputedStyle(element).filter, visibility: getComputedStyle(element).visibility })),
              marks: [...document.querySelectorAll('.gr-pdf-mark')].map(rect),
            };
          });
          await writeFile(resolve(out, `${prefix}${suffix}.probe.json`), JSON.stringify(probe, null, 2));
          await target.screenshot({ path: resolve(out, `${prefix}${suffix}.png`), fullPage: true });
          shots.push(resolve(out, `${prefix}${suffix}.png`));
          console.log(`Wrote ${prefix}${suffix}.png`);
        };
        const prepareSynthetic = fixture ? target => syntheticRoutes(target, sceneName, reviews, folder) : undefined;
        if (fixture) await prepareSynthetic(context);
        if (scene.navigate !== false) await page.goto(url, { waitUntil: 'networkidle' });
        await scene.run({ page, context, browser, options, state, capture, out, prefix, prepareSynthetic });
        if (['not-set-up', 'sent'].includes(sceneName)) {
          const contrast = await page.evaluate(() => {
            const content = document.querySelector('.cm-content');
            const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
            const composite = (front, back, alpha) => front.map((value, i) => value * alpha + back[i] * (1 - alpha));
            let background = [255, 255, 255];
            const ancestors = [];
            for (let node = content; node; node = node.parentElement) ancestors.unshift(node);
            let opacity = 1;
            for (const node of ancestors) {
              const style = getComputedStyle(node);
              opacity *= Number(style.opacity);
              const colour = style.backgroundColor;
              const alpha = colour.startsWith('rgba') ? Number(colour.match(/[\d.]+/g)[3]) : 1;
              background = composite(rgb(colour), background, alpha);
            }
            const foreground = composite(rgb(getComputedStyle(content).color), background, opacity);
            const luminance = rgb => rgb.map(value => { const v = value / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
            const a = luminance(foreground), b = luminance(background);
            return { foreground, background, opacity, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
          });
          await writeFile(resolve(out, `${prefix}-contrast.json`), JSON.stringify(contrast, null, 2));
          if (contrast.opacity < .8 || contrast.ratio < 4.5) throw new Error(`Read-only contrast failed: ${contrast.ratio.toFixed(2)}:1, opacity ${contrast.opacity}.`);
          console.log(`Read-only draft contrast ${contrast.ratio.toFixed(2)}:1, opacity ${contrast.opacity}.`);
        }
        if (!fixture && ['editor', 'pdf', 'both'].includes(sceneName)) {
          for (const width of [1600, 640]) {
            await page.setViewportSize({ width, height: 1000 });
            await page.locator('.gr-items > li').last().scrollIntoViewIfNeeded();
            if (width === 640) await page.locator('#content').evaluate(element => { element.scrollTo({ top: element.scrollHeight, behavior: 'instant' }); });
            await page.waitForTimeout(150);
            const geometry = await page.evaluate(() => {
              const panel = document.querySelector('.gr-side'), footer = document.querySelector('footer');
              const rect = element => { const r = element.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; };
              const last = panel.querySelector('.gr-items > li:last-child');
              const ancestors = []; for (let node = panel.parentElement; node; node = node.parentElement) ancestors.push({ tag: node.tagName, id: node.id, overflow: getComputedStyle(node).overflowY, flex: getComputedStyle(node).flex, minHeight: getComputedStyle(node).minHeight, heightStyle: getComputedStyle(node).height, scrollTop: node.scrollTop, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight, ...rect(node) });
              return { ancestors, panel: rect(panel), last: rect(last), footer: rect(footer), paddingBottom: getComputedStyle(document.querySelector('#gloss-review')).paddingBottom, buttons: [...last.querySelectorAll('button')].map(rect), overflow: getComputedStyle(panel).overflowY, columns: getComputedStyle(document.querySelector('.gr-body')).gridTemplateColumns };
            });
            await writeFile(resolve(out, `${prefix}-layout-${width}.json`), JSON.stringify(geometry, null, 2));
            if (geometry.panel.bottom > geometry.footer.top + 1 || geometry.last.bottom > geometry.footer.top + 1 || geometry.overflow !== (width === 640 ? 'visible' : 'auto')) throw new Error(`Footer overlap at ${width}px.`);
            if (parseFloat(geometry.paddingBottom) < geometry.footer.height || geometry.buttons.some(button => button.bottom > geometry.footer.top || button.top < 0)) throw new Error(`Footer covers a button or page padding is too small at ${width}px.`);
            if (width === 640 && geometry.columns.split(' ').length !== 1) throw new Error('Narrow layout is not stacked.');
            await capture(`-layout-${width}`);
          }
          await page.setViewportSize(options.viewport);
          await page.waitForTimeout(150);
          await page.locator('#content').evaluate(element => { element.scrollTo({ top: 0, behavior: 'instant' }); });
        }
        await capture();
        if (['pdf', 'both'].includes(sceneName) && colour === 'dark') {
          await page.waitForTimeout(1500);
          await capture('-settled');
        }
        if (fixture && sceneName === 'overall') {
          await page.getByRole('button', { name: 'Send review', exact: true }).click();
          await page.getByRole('status').getByText('Review sent. Thank you.', { exact: true }).waitFor();
          if (!await page.locator('.gr-overall-text').count() || await page.locator('#gr-overall').count()) throw new Error('Sent overall comment must be plain text.');
          await capture('-sent');
        }
        results.push({ scene: sceneName, browser: browserName, colour, result: 'pass', shots });
      } catch (error) {
        const target = context.pages().at(-1);
        const shot = resolve(out, `${sceneName}-${browserName}-${colour}-failure.png`);
        if (target) await target.screenshot({ path: shot, fullPage: true });
        const probe = target ? await target.evaluate(() => ({
          status: document.querySelector('.gr-head [role="status"]')?.textContent,
          editor: document.querySelector('.cm-content')?.textContent,
          cards: document.querySelectorAll('.gr-items > li').length,
          unplaced: document.querySelector('.gr-unplaced')?.textContent,
          formVisible: !!document.querySelector('#gr-form') && !document.querySelector('#gr-form').hidden,
          headings: [...document.querySelectorAll('h1, h2')].map(element => element.textContent),
          focus: document.activeElement?.id,
          pdfPages: document.querySelectorAll('#gr-pdf canvas').length,
        })) : {};
        const frames = (error.stack ?? '').split('\n').filter(line => /^\s+at .*scripts\//.test(line));
        results.push({ scene: sceneName, browser: browserName, colour, result: 'fail', shots, shot, probe, frames });
        console.log(`FAIL ${sceneName} ${browserName} ${colour}: ${JSON.stringify({ probe, frames })}`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
  await writeFile(resolve(out, `${sceneName}-${browserName}-results.json`), JSON.stringify(results, null, 2));
  for (const result of results) console.log(`${result.result.toUpperCase()} ${sceneName} ${browserName} ${result.colour}`);
  if (results.some(result => result.result === 'fail')) process.exitCode = 1;
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
