// The "New text" look of the PDF: click the switch, check each card against the words drawn for it, and the look kept over a reload.
import { expect } from '@playwright/test';

const offPdf = 'Not shown on the PDF.';

function drawn(page) {
  return page.evaluate(() => [...document.querySelectorAll('.gr-items > li')].filter(li => li.querySelector('ins, del')).map(li => {
    const id = li.dataset.id, pick = selector => [...document.querySelectorAll(`${selector}[data-id="${id}"]`)];
    return {
      id,
      deleted: li.querySelector('del')?.textContent ?? '',
      inserted: (li.querySelector('ins')?.textContent ?? '').trim().replace(/\s+/g, ' '),
      line: li.querySelector('.gr-off-pdf')?.textContent ?? null,
      marks: document.querySelectorAll(`.gr-pdf-mark[data-id="${id}"]`).length,
      covers: pick('.gr-pdf-cover').length,
      words: [...pick('.gr-pdf-new'), ...pick('.gr-pdf-caret').map(bar => bar.querySelector('.gr-pdf-label'))].map(node => node.textContent).join(' '),
      old: pick('.gr-pdf-struck').length,
      carets: pick('.gr-pdf-caret').length,
    };
  }));
}

export async function checkNewText(page) {
  await page.getByRole('button', { name: 'New text', exact: true }).click();
  await expect(page.locator('#gr-pdf-look-new')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.locator('.gr-pdf-cover').count()).toBeGreaterThan(0);
  await expect(page.locator('.gr-pdf-struck')).toHaveCount(0);
  const cards = await drawn(page);
  const off = cards.filter(card => card.line === offPdf);
  if (!off.length || off.some(card => card.marks)) throw new Error(`An unplaceable card is missing or has marks: ${JSON.stringify(off)}.`);
  for (const card of cards.filter(c => !c.line)) {
    if (card.old) throw new Error(`The Changes marks of "${card.deleted || card.inserted}" remain: ${JSON.stringify(card)}.`);
    if (card.deleted && !card.covers) throw new Error(`"${card.deleted}" is not covered: ${JSON.stringify(card)}.`);
    if (!card.deleted && card.inserted && !card.carets) throw new Error(`The insertion "${card.inserted}" has no caret: ${JSON.stringify(card)}.`);
    if (!card.deleted && card.covers) throw new Error(`The insertion "${card.inserted}" covers words: ${JSON.stringify(card)}.`);
    if (card.words !== card.inserted) throw new Error(`The words drawn for "${card.deleted}" are "${card.words}", not "${card.inserted}".`);
  }
  await checkCaretHover(page);
}

/** Moves the mouse onto each caret's coordinates, never focusing it, and requires its label to show there and to hide again elsewhere. */
export async function checkCaretHover(page) {
  const carets = page.locator('.gr-pdf-caret');
  const count = await carets.count();
  if (!count) throw new Error('No caret to hover.');
  for (let i = 0; i < count; i++) {
    const caret = carets.nth(i);
    await caret.scrollIntoViewIfNeeded();
    const label = caret.locator('.gr-pdf-label');
    await page.mouse.move(2, 2);
    if (await label.isVisible()) throw new Error('A caret label shows without hover.');
    const box = await caret.boundingBox();
    if (!box) throw new Error('The caret has no box.');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(label).toBeVisible();
    await page.mouse.move(2, 2);
  }
}

/** After a reload the look is still New text. */
export async function checkLookKept(page, waitForPdf) {
  await page.reload();
  await waitForPdf(page);
  await expect(page.locator('#gr-pdf-look-new')).toHaveAttribute('aria-pressed', 'true');
}
