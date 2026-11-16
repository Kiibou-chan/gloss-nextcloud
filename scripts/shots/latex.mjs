// The latex-proposals scene: proposals on a LaTeX draft, joined by data-id to the marks on its PDF.
import { expect } from '@playwright/test';
import { checkLookKept, checkNewText } from './new-text.mjs';

const offPdf = 'Not shown on the PDF.';

/** The cases, those that cross or sit beside LaTeX markup among them. */
export const cases = [
  { name: 'deletion inside \\emph{}', find: 'quiet', insert: '', deleted: 'quiet', struck: ['quiet'], caret: null },
  { name: 'replacement inside \\textbf{}', find: 'above', insert: 'over', deleted: 'above', struck: ['above'], caret: 'over' },
  { name: 'replacement across \\textbf{} and the following words', find: 'meadow} and', insert: 'pasture or', deleted: 'meadow} and', struck: ['meadow', 'and'], caret: 'pasture or' },
  { name: 'heading replacement', find: 'Observations', insert: 'Notes', deleted: 'Observations', struck: ['Observations'], caret: 'Notes' },
  { name: 'replacement across \\hspace{2mm}', find: 'drift', select: 'drift\\hspace{2mm}across'.length, insert: 'wander beyond', deleted: 'drift\\hspace{2mm}across', struck: ['drift', 'across'], caret: 'wander beyond' },
  { name: 'replacement across the wrapped line', find: 'where Zeta', insert: 'while Iota', deleted: 'where Zeta', struck: ['where', 'Zeta'], caret: 'while Iota', lines: 2 },
  { name: 'pure insertion', find: 'rain.', after: ' Truly', deleted: '', struck: [], caret: 'Truly' },
  { name: 'replacement spanning Section~\\ref{}', find: 'Section~', select: 'Section~\\ref{sec:obs} for'.length, insert: 'Part two instead', deleted: 'Section~\\ref{sec:obs} for', off: true },
];

async function edit(page, find, change) {
  await find(page, change.find);
  if (change.select) {
    // The search field reads a backslash as an escape, so the span is selected by keys.
    await page.keyboard.press('ArrowLeft');
    for (let i = 0; i < change.select; i++) await page.keyboard.press('Shift+ArrowRight');
  }
  if (change.after !== undefined) await page.keyboard.press('ArrowRight');
  const text = change.after ?? change.insert;
  if (text === '') await page.keyboard.press('Backspace');
  else await page.keyboard.insertText(text);
}

/** Per proposal card: its marks and the PDF words each struck mark covers, measured in the browser. */
function measure(page) {
  return page.evaluate(() => {
    const spans = [...document.querySelectorAll('#gr-pdf .textLayer span')].filter(span => span.firstChild?.nodeType === Node.TEXT_NODE);
    const words = spans.flatMap(span => {
      const node = span.firstChild, out = [];
      for (const match of node.textContent.matchAll(/\S+/g)) {
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        out.push({ text: match[0], rect: range.getBoundingClientRect() });
      }
      return out;
    });
    const covered = box => words.filter(word => {
      const across = Math.min(box.right, word.rect.right) - Math.max(box.left, word.rect.left);
      const mid = (box.top + box.bottom) / 2;
      return across > word.rect.width / 2 && mid >= word.rect.top && mid <= word.rect.bottom;
    }).map(word => word.text);
    return [...document.querySelectorAll('.gr-items > li')].filter(li => li.querySelector('ins, del')).map(li => {
      const id = li.dataset.id;
      const struck = [...document.querySelectorAll(`.gr-pdf-struck[data-id="${id}"]`)].map(mark => ({ box: mark.getBoundingClientRect() }));
      return {
        id,
        deleted: li.querySelector('del')?.textContent ?? '',
        inserted: li.querySelector('ins')?.textContent ?? '',
        line: li.querySelector('.gr-off-pdf')?.textContent ?? null,
        marks: document.querySelectorAll(`.gr-pdf-mark[data-id="${id}"]`).length,
        words: struck.flatMap(mark => covered(mark.box)),
        lines: new Set(struck.map(mark => Math.round(mark.box.top))).size,
        carets: [...document.querySelectorAll(`.gr-pdf-caret[data-id="${id}"]`)].map(caret => caret.querySelector('.gr-pdf-label')?.textContent ?? ''),
      };
    });
  });
}

/** Joins every case's card to its marks by data-id; the \ref card says it is off the PDF and has no mark. */
export async function checkLatexMarks(page) {
  await expect.poll(() => page.locator('.gr-pdf-struck').count()).toBeGreaterThan(0);
  const cards = await measure(page);
  for (const want of cases) {
    const card = cards.find(c => c.deleted === want.deleted && c.inserted.trim() === (want.insert ?? want.after).trim());
    if (!card) throw new Error(`No proposal card for ${want.name}.`);
    if (want.off) {
      if (card.line !== offPdf || card.marks) throw new Error(`${want.name}: card line ${JSON.stringify(card.line)}, ${card.marks} marks: ${JSON.stringify(card)}.`);
      continue;
    }
    if (card.line) throw new Error(`${want.name}: the card says "${card.line}" although it has a place.`);
    if (JSON.stringify(card.words) !== JSON.stringify(want.struck)) throw new Error(`${want.name}: struck marks cover ${JSON.stringify(card.words)}, not ${JSON.stringify(want.struck)}.`);
    if (want.lines && card.lines !== want.lines) throw new Error(`${want.name}: struck on ${card.lines} lines, not ${want.lines}.`);
    if (want.caret === null ? card.carets.length : card.carets.length !== 1 || card.carets[0].trim() !== want.caret) throw new Error(`${want.name}: caret labels ${JSON.stringify(card.carets)}.`);
  }
}

export function latexScene({ ready, find, status }) {
  const run = view => async ({ page, capture }) => {
    await ready(page);
    for (const change of cases) await edit(page, find, change);
    await expect(page.locator('.gr-items > li').filter({ has: page.locator('ins, del') })).toHaveCount(cases.length);
    await expect(status(page)).toHaveText('Saved', { timeout: 30_000 });
    await page.getByRole('button', { name: view, exact: true }).click();
    await expect(page.locator('#gr-pdf canvas').first()).toBeVisible();
    await checkLatexMarks(page);
    if (view === 'PDF') {
      await capture('-pdf');
      await page.locator('.gr-items > li').filter({ hasText: offPdf }).scrollIntoViewIfNeeded();
      await capture('-ref');
      await page.getByRole('button', { name: 'Both', exact: true }).click();
      await expect(page.locator('#gr-text .cm-content')).toBeVisible();
      await checkLatexMarks(page);
      await capture('-both');
      await page.getByRole('button', { name: 'PDF', exact: true }).click();
      await checkNewText(page);
      await capture('-new');
      await page.getByRole('button', { name: 'Both', exact: true }).click();
      await capture('-new-both');
      await checkLookKept(page, async target => { await expect(target.locator('#gr-pdf canvas').first()).toBeVisible(); await expect.poll(() => target.locator('.gr-pdf-cover').count()).toBeGreaterThan(0); });
    }
  };
  return { folder: 'Latex', run: run('PDF') };
}
