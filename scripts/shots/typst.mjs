// The typst-compile and typst-fallback scenes: the draft compiled in the browser under three looks, and the overlay on the uploaded PDF when it cannot compile.
import { expect } from '@playwright/test';

const COMPILING = 'Showing your PDF while the draft compiles.';
const PACKAGE = 'Showing your PDF; the draft uses a package the browser cannot load.';

/** Records each compiler worker answer on `window.__compiles`, before the page's own scripts run. */
async function watchCompiles(context) {
  await context.addInitScript(() => {
    const Original = window.Worker;
    window.__compiles = [];
    window.Worker = class extends Original {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', event => {
          if (event.data && typeof event.data.ms === 'number') window.__compiles.push({ ms: event.data.ms, pdf: !!event.data.pdf });
        });
      }
    };
  });
}

const compiles = page => page.evaluate(() => window.__compiles.length);

/** The compiled look has landed: a new answer arrived and the quiet line is gone. */
async function compiled(page, before) {
  await expect.poll(() => compiles(page), { timeout: 120_000 }).toBeGreaterThan(before);
  await expect(page.locator('.gr-pdf-note-line')).toHaveCount(0, { timeout: 120_000 });
  await expect(page.locator('#gr-pdf canvas').first()).toBeVisible();
  // The session places marks 400 ms after a document swap.
  await page.waitForTimeout(700);
}

function red(page) {
  return page.evaluate(() => [...document.querySelectorAll('#gr-pdf canvas')].reduce((total, canvas) => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] && pixels[i] > 170 && pixels[i + 1] < 90 && pixels[i + 2] < 90) total++;
    return total;
  }, 0));
}

function ink(page) {
  return page.evaluate(() => [...document.querySelectorAll('#gr-pdf canvas')].reduce((total, canvas) => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] && pixels[i] < 180 && pixels[i + 1] < 180 && pixels[i + 2] < 180) total++;
    return total;
  }, 0));
}

async function replace(page, find, from, to, extra = 0) {
  await find(page, from);
  if (extra) {
    await page.keyboard.press('ArrowLeft');
    for (let i = 0; i < extra; i++) await page.keyboard.press('Shift+ArrowRight');
  }
  await page.keyboard.insertText(to);
}

async function typstCompile(args, helpers) {
  const { page, context, capture } = args;
  const { ready, find, comment, status, pdfSelection } = helpers;
  await watchCompiles(context);
  await page.reload({ waitUntil: 'networkidle' });
  await ready(page);
  await replace(page, find, 'grow', 'flourish');
  await find(page, 'sing');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.insertText(' softly');
  await replace(page, find, 'gather', 'collect near', 'gather\naround'.length);
  await replace(page, find, 'study', 'survey');
  await replace(page, find, 'a^2', 'x^2');
  await replace(page, find, 'covers', 'spreads over');
  await comment(page, 'stones');
  await expect(page.locator('.gr-items > li')).toHaveCount(7);
  await expect(status(page)).toHaveText('Saved', { timeout: 30_000 });
  await capture('-editor');
  expect(await compiles(page)).toBe(0);
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  await compiled(page, 0);
  await expect(page.locator('#gr-pdf-look-changes')).toHaveAttribute('aria-pressed', 'true');
  expect(await red(page)).toBeGreaterThan(50);
  expect(await ink(page)).toBeGreaterThan(1000);
  await expect(page.locator('.gr-unmarked')).toHaveCount(1);
  await capture('-changes');
  const afterChanges = await compiles(page);
  await page.getByRole('button', { name: 'New text', exact: true }).click();
  await compiled(page, afterChanges);
  await expect(page.locator('#gr-pdf-look-new')).toHaveAttribute('aria-pressed', 'true');
  expect(await red(page)).toBe(0);
  expect(await ink(page)).toBeGreaterThan(1000);
  await capture('-new');
  await pdfSelection(page, 'Epsilon seeds');
  await expect(page.locator('.gr-form blockquote')).toContainText('Epsilon seeds');
  await capture('-new-selection');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Original', exact: true }).click();
  await expect(page.locator('#gr-pdf-look-original')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#gr-pdf .textLayer')).not.toContainText('survey');
  await page.waitForTimeout(700);
  await expect(page.locator('.gr-pdf-struck, .gr-pdf-caret, .gr-pdf-cover, .gr-pdf-margin')).toHaveCount(0);
  await expect.poll(() => page.locator('.gr-pdf-mark').count()).toBeGreaterThan(0);
  await capture('-original');
}

async function typstFallback(args, helpers) {
  const { page, capture } = args;
  const { ready, find, status } = helpers;
  await ready(page);
  await replace(page, find, 'grow', 'flourish');
  await replace(page, find, 'drift', '');
  await expect(status(page)).toHaveText('Saved', { timeout: 30_000 });
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  await expect(page.locator('.gr-pdf-note-line')).toHaveText(PACKAGE, { timeout: 30_000 });
  await expect.poll(() => page.locator('.gr-pdf-struck').count()).toBeGreaterThan(0);
  await expect(page.locator('.gr-pdf-note-line')).not.toHaveText(COMPILING);
  await capture('-changes');
}

export function typstScenes(helpers) {
  return {
    'typst-compile': { folder: 'Typst', run: args => typstCompile(args, helpers) },
    'typst-fallback': { folder: 'Typst', run: args => typstFallback(args, helpers) },
  };
}
