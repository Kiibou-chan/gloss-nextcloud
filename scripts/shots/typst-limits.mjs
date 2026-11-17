// Typst drafts that cannot compile in the browser: each shows the uploaded PDF with the overlay and one quiet line, and throws no page error.
import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const paper = () => readFile(new URL('../../test/fixtures/nc/Typst/paper.typ', import.meta.url), 'utf8');
const LINES = {
  compile: 'Showing your PDF; the draft does not compile in the browser.',
  large: 'Draft too large to compile live; showing your PDF.',
  start: 'Showing your PDF; the browser could not start the compiler.',
};

/** Page errors the scene's page throws, collected from before the first interaction. */
function watchErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error.message)));
  return errors;
}

async function expectOverlayAndLine(page, errors, line) {
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  await expect(page.locator('.gr-pdf-note-line')).toHaveText(line, { timeout: 60_000 });
  await expect(page.locator('#gr-pdf canvas').first()).toBeVisible();
  await expect.poll(() => page.locator('.gr-pdf-struck').count()).toBeGreaterThan(0);
  await expect(page.locator('.gr-pdf-note-line')).toHaveCount(1);
  // The stack overflow of a missing compiler came about 600 ms after the line.
  await page.waitForTimeout(2000);
  await expect(page.locator('.gr-pdf-note-line')).toHaveText(line);
  if (errors.length) throw new Error(`Page errors: ${JSON.stringify(errors)}`);
}

async function twoEdits({ page }, { ready, find, status }) {
  await ready(page);
  await find(page, 'grow');
  await page.keyboard.insertText('flourish');
  await find(page, 'drift');
  await page.keyboard.press('Backspace');
  await expect(status(page)).toHaveText('Saved', { timeout: 30_000 });
}

async function error(args, helpers) {
  const errors = watchErrors(args.page);
  await twoEdits(args, helpers);
  await expectOverlayAndLine(args.page, errors, LINES.compile);
  await args.capture('-changes');
}

async function lines(args, helpers) {
  const errors = watchErrors(args.page);
  await twoEdits(args, helpers);
  await expectOverlayAndLine(args.page, errors, LINES.large);
  await args.capture('-changes');
}

async function proposals(args, helpers) {
  const { page, capture } = args;
  const { ready, status, find } = helpers;
  const errors = watchErrors(page);
  await ready(page);
  for (let i = 0; i < 401; i++) {
    await find(page, `w${String(i * 10 + 1).padStart(4, '0')}`);
    await page.keyboard.insertText('y');
  }
  await find(page, 'grow');
  await page.keyboard.insertText('flourish');
  await expect(page.locator('.gr-items > li')).toHaveCount(402, { timeout: 60_000 });
  await expect(status(page)).toHaveText('Saved', { timeout: 60_000 });
  await expectOverlayAndLine(page, errors, LINES.large);
  await capture('-changes');
}

async function noFonts(args, helpers) {
  const { page, context } = args;
  await context.route('**/fonts/**', route => route.abort());
  const errors = watchErrors(page);
  await twoEdits(args, helpers);
  await expectOverlayAndLine(page, errors, LINES.start);
  await args.capture('-changes');
}

const linesDraft = async () => ({ main: 'paper.typ', text: `${await paper()}${Array.from({ length: 2000 }, (_, i) => `// Synthetic filler ${i + 1}.`).join('\n')}\n` });
const wordsDraft = async () => ({ main: 'paper.typ', text: `${Array.from({ length: 4010 }, (_, i) => `w${String(i + 1).padStart(4, '0')}`).join(' ')}\n\n${await paper()}` });
const errorDraft = async () => ({ main: 'paper.typ', text: `${await paper()}\n#let broken = (1,\n` });

export function typstLimitScenes(helpers) {
  return {
    'typst-error': { folder: 'Typst', draft: errorDraft, run: args => error(args, helpers) },
    'typst-lines': { folder: 'Typst', draft: linesDraft, run: args => lines(args, helpers) },
    'typst-proposals': { folder: 'Typst', draft: wordsDraft, run: args => proposals(args, helpers) },
    'typst-no-fonts': { folder: 'Typst', run: args => noFonts(args, helpers) },
  };
}
