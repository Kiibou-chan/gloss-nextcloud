// Synthetic page-behaviour evidence, with the real bundle, PDF, and browser adapters.
// Run: node scripts/shots/page.mjs <outdir> [chromium|firefox].
import { chromium, firefox, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const out = resolve(process.argv[2] ?? 'shots/page');
const engine = process.argv[3] ?? 'chromium';
if (!['chromium', 'firefox'].includes(engine)) throw new Error('Choose chromium or firefox.');
const [bundle, worker, css, pdfCss, source, pdf] = await Promise.all([
  readFile('js/gloss-review.js'), readFile('js/pdf.worker.js'), readFile('css/review.css', 'utf8'),
  readFile('css/pdf-text-layer.css', 'utf8'), readFile('test/fixtures/nc/Review/paper.typ', 'utf8'),
  readFile('test/fixtures/nc/Review/paper.pdf'),
]);
await mkdir(out, { recursive: true });
const browser = await ({ chromium, firefox }[engine]).launch();
try {
  for (const colour of ['light', 'dark']) {
    const context = await browser.newContext({ colorScheme: colour, viewport: { width: 1600, height: 1000 } });
    const records = new Map();
    let releasePdf;
    const pdfGate = new Promise(done => { releasePdf = done; });
    const html = reviewable => `<!doctype html><html lang="en"><meta charset="utf-8"><title>Synthetic review</title><style>
      :root { color-scheme: light dark; --color-main-background: #fff; --color-main-text: #222; --color-text-maxcontrast: #555; --color-border: #bbb; --color-background-hover: #eee; --color-primary-element: #006da3; --color-primary-element-light: #d9edf8; --border-radius: 6px; --border-radius-large: 10px; }
      @media (prefers-color-scheme: dark) { :root { --color-main-background: #181818; --color-main-text: #eee; --color-text-maxcontrast: #bbb; --color-border: #666; --color-background-hover: #292929; --color-primary-element: #80cfff; --color-primary-element-light: #244459; } }
      body { margin: 24px; font: 16px/1.5 system-ui; background: var(--color-main-background); color: var(--color-main-text); }
      input, textarea, button { box-sizing: border-box; font: inherit; padding: 8px; color: inherit; background: var(--color-main-background); border: 1px solid var(--color-border); border-radius: 6px; }
      button:enabled { cursor: pointer; } button:disabled, input:disabled { opacity: .5; }
      ${pdfCss}\n${css}
      [contenteditable] { font-family: system-ui, sans-serif; }
      </style><body><p>Synthetic review fixture, ${engine}, ${colour}.</p><div id="gloss-review" data-token="synthetic" data-worker="/pdf.worker.js" data-reviewable="${reviewable ? 1 : 0}" data-has-pdf="1"><header class="gr-head"></header><main class="gr-body"><article id="gr-text" class="gr-text"></article><article id="gr-pdf" class="gr-pdf" hidden></article><aside class="gr-side"></aside></main></div><script src="/gloss-review.js"></script></body></html>`;
    await context.route('http://gloss.invalid/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/gloss-review.js') return route.fulfill({ contentType: 'text/javascript', body: bundle });
      if (path === '/pdf.worker.js') return route.fulfill({ contentType: 'text/javascript', body: worker });
      if (path.endsWith('/pdf')) { await pdfGate; return route.fulfill({ contentType: 'application/pdf', body: pdf }); }
      if (path.endsWith('/draft')) return route.fulfill({ json: { main: 'paper.typ', files: [{ file: 'paper.typ', text: source, etag: 'synthetic-v1' }] } });
      if (path.endsWith('/review/open')) {
        const params = new URLSearchParams(route.request().postData() ?? '');
        const record = records.get(params.get('key'));
        return route.fulfill({ json: record ? { review: record, revision: record.revision } : { review: null } });
      }
      if (path.endsWith('/review') && route.request().method() === 'POST') {
        const params = new URLSearchParams(route.request().postData() ?? '');
        const record = JSON.parse(params.get('review')); records.set(params.get('key'), record);
        return route.fulfill({ json: { revision: Number(params.get('baseRevision')) + 1 } });
      }
      if (/\/r\/(review|plain|conflict)$/.test(path)) return route.fulfill({ contentType: 'text/html', body: html(!path.endsWith('/plain')) });
      return route.abort();
    });
    const page = await context.newPage();
    const capture = async label => {
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
      const path = resolve(out, `${label}-${engine}-${colour}.png`);
      await page.screenshot({ path, fullPage: true }); console.log(path);
    };
    const content = page.locator('.cm-content');
    const select = async word => {
      await content.press('Control+f');
      const search = page.locator('.cm-search input[name="search"]');
      await search.fill(word); await search.dispatchEvent('change'); await search.press('Enter');
      await page.keyboard.press('Escape');
      await content.press('Control+Alt+m');
    };
    await page.goto('http://gloss.invalid/r/review', { waitUntil: 'networkidle' });
    await expect(page.locator('#gr-status')).toHaveText('Enter your name to start.'); await capture('initial');
    await page.locator('#gr-overall').focus(); await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Comment on selection', exact: true })).toBeFocused();
    await expect(page.locator('#gr-status')).toHaveText('Enter your name to start.'); await capture('overall-tab');
    await content.click(); await page.keyboard.press('x');
    await expect(page.locator('#gr-name')).toBeFocused();
    await expect(page.locator('#gr-status')).toHaveText('Enter your name first.'); await capture('name-prompt');
    await page.locator('#gr-name').fill('Ada Example'); await page.locator('#gr-name').press('Tab');
    await page.locator('#gr-name').fill(''); await page.locator('#gr-name').press('Tab');
    await expect(page.locator('#gr-status')).toHaveText('Enter your name to continue.'); await capture('name-blank');
    await page.locator('#gr-name').fill('Ada Example'); await page.locator('#gr-name').press('Tab');
    await content.click(); await content.press('Control+a');
    await expect(page.locator('#gr-form')).toBeHidden();
    await page.getByRole('button', { name: 'Comment on selection', exact: true }).click();
    await expect(page.locator('#gr-form')).toBeVisible();
    await expect(page.locator('#gr-quote')).toHaveText(/^.{200}…$/s); await capture('bounded-quote');
    await page.locator('#gr-cancel').click(); await content.dispatchEvent('mouseup');
    await expect(page.locator('#gr-form')).toBeVisible();
    await page.locator('#gr-comment').fill('Half-typed synthetic comment, retained while checking another passage.');
    await content.click(); await content.press('Control+a'); await content.dispatchEvent('mouseup');
    await expect(page.locator('#gr-comment')).toHaveValue('Half-typed synthetic comment, retained while checking another passage.'); await capture('draft-retained');
    await content.press('ArrowRight'); await page.keyboard.type(' Synthetic editor addition.');
    await expect(page.locator('#gr-status')).toHaveText('Saved', { timeout: 20_000 });
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('#gr-form')).toBeVisible();
    await expect(page.locator('#gr-comment')).toHaveValue('Half-typed synthetic comment, retained while checking another passage.');
    await expect(page.locator('#gr-quote')).toHaveText(/^.{200}…$/s); await capture('draft-reloaded');
    await page.locator('#gr-overall').fill('Synthetic overall comment, shown as plain text after sending.');
    await page.getByRole('button', { name: 'Send review', exact: true }).click();
    await expect(page.locator('#gr-status')).toHaveText('Add or cancel your comment before sending the review.'); await capture('draft-send');
    await page.locator('#gr-cancel').click(); await expect(page.locator('#gr-comment')).toHaveValue('');
    await select('grow');
    await expect(page.locator('#gr-quote')).toHaveText('grow');
    await page.locator('#gr-comment').fill('Please clarify this synthetic observation.');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.locator('#gr-overall').fill('Synthetic overall comment, shown as plain text after sending.');
    await expect(page.locator('#gr-status')).toHaveText('Saved', { timeout: 20_000 }); await capture('editor');
    await page.getByRole('button', { name: 'Both', exact: true }).click();
    await expect(page.locator('#gr-status')).toHaveText('Loading the PDF…'); await capture('pdf-loading'); releasePdf();
    await expect.poll(async () => (await page.locator('.gr-pdf-note-line').allTextContents()).includes('Showing your PDF while the draft compiles.'), { timeout: 30_000 }).toBe(false);
    await expect(page.locator('.gr-page .textLayer span').first()).toBeVisible();
    await expect(page.locator('.gr-pdf-mark').first()).toBeVisible();
    await expect(page.locator('#gr-status')).not.toHaveText('Loading the PDF…'); await capture('both');
    await page.getByRole('button', { name: 'PDF', exact: true }).click(); await capture('pdf');
    const pane = page.locator('#gr-pdf');
    await page.setViewportSize({ width: 1600, height: 720 });
    await expect.poll(() => pane.evaluate(el => el.scrollHeight - el.clientHeight)).toBeGreaterThan(100);
    await pane.evaluate(el => { el.scrollTop = el.scrollHeight; }); await capture('pdf-bottom');
    await expect.poll(() => pane.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(2);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await pane.evaluate(el => { el.scrollTop = 0; });
    await page.getByRole('button', { name: 'Send review', exact: true }).click();
    await expect(page.locator('#gr-status')).toHaveText('Review sent. Thank you.');
    await expect(page.locator('#gr-name')).toBeDisabled(); await expect(page.locator('#gr-overall')).toHaveCount(0); await capture('sent');
    await page.goto('http://gloss.invalid/r/plain');
    await expect(page.locator('#gr-status')).toHaveText('This link is not set up for reviewing.');
    await expect(page.locator('#gr-overall')).toHaveCount(0); await capture('unreviewable');
    const key = 'Abcdef1234567890', at = '2026-11-15T20:00:00.000Z', from = source.indexOf('grow');
    const record = { format: 1, revision: 3, name: 'Ada Example', draft: { file: 'paper.typ', etag: 'synthetic-v1' }, sent: false, sentAt: null, updatedAt: at, items: [{ id: 'abcdefghij', kind: 'proposal', file: 'paper.typ', from, quote: { exact: 'grow', prefix: source.slice(Math.max(0, from - 32), from), suffix: source.slice(from + 4, from + 36) }, proposal: 'flourish', comments: [{ text: 'A synthetic suggestion.', at }], at }] };
    records.set(key, { ...record, revision: 4 });
    await page.evaluate(({ key, record, at }) => {
      localStorage.setItem('gloss-review:synthetic:' + key, JSON.stringify({ review: JSON.stringify(record), revision: 3, pending: null, saved: true, dirty: true, at }));
    }, { key, record, at });
    await page.goto(`http://gloss.invalid/r/conflict#${key}`);
    await expect(page.locator('#gr-status')).toContainText('were not restored');
    await page.getByRole('button', { name: 'Show the changes from this browser' }).click(); await capture('kept-changes');
    await context.close();
  }
} finally { await browser.close(); }
