import { checkPageNotClipped, latexScene } from './latex.mjs';
import { checkCaretHover, checkLookKept, checkNewText } from './new-text.mjs';
import { typstScenes } from './typst.mjs';
import { liveScenes, sentFileRemoved } from './live.mjs';
import { expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const reviewer = 'Ada Example';
const content = page => page.locator('#gr-text .cm-content');
const count = page => page.locator('.gr-count');
const status = page => page.getByRole('status');
const name = page => page.getByRole('textbox', { name: 'Your name' });
const send = page => page.getByRole('button', { name: 'Send review', exact: true });

async function ready(page) {
  await expect(content(page)).toBeVisible();
  await name(page).fill(reviewer);
  await name(page).press('Tab');
  await expect(content(page)).toHaveAttribute('contenteditable', 'true');
}

async function find(page, word) {
  await content(page).click();
  await page.keyboard.press('Control+f');
  const search = page.locator('.cm-search input[name="search"]');
  await search.fill(word);
  await search.dispatchEvent('change');
  await search.press('Enter');
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe(word);
}

async function comment(page, word) {
  await find(page, word);
  await content(page).dispatchEvent('mouseup');
  await expect(page.getByRole('textbox', { name: 'Comment', exact: true })).toBeVisible();
  await expect(page.locator('.gr-form blockquote')).toHaveText(word);
  await page.getByRole('textbox', { name: 'Comment', exact: true }).fill('Please clarify this synthetic observation.');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
}

async function editor({ page }) {
  await ready(page);
  await find(page, 'grow');
  await page.keyboard.insertText('flourish');
  await expect(page.locator('.gr-items ins')).toHaveText('flourish');
  await find(page, 'sing');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.insertText(' softly');
  await expect(page.locator('.gr-items ins').filter({ hasText: 'softly' })).toHaveCount(1);
  await find(page, 'drift');
  await page.keyboard.press('Backspace');
  await comment(page, 'stones');
  console.log(`Editor count: ${await count(page).textContent()}`);
  await expect(count(page)).toHaveText('3 changes, 1 comment');
  await expect(page.locator('#gr-text .gr-ins').first()).toBeVisible();
  await expect(page.locator('#gr-text del').first()).toBeVisible();
  await expect(page.locator('.gr-items > li')).toHaveCount(4);
  const replacement = page.locator('.gr-items > li').filter({ has: page.locator('del', { hasText: 'grow' }) });
  await expect(replacement.locator('ins')).toHaveText('flourish');
  await expect(page.locator('.gr-items > li del').filter({ hasText: 'drift' })).toHaveCount(1);
  await expect(page.locator('.gr-items blockquote')).toHaveText('stones');
  await expect(status(page)).toHaveText('Saved', { timeout: 30_000 });
  await page.reload({ waitUntil: 'networkidle' });
  await expect(name(page)).toHaveValue(reviewer);
  await expect(count(page)).toHaveText('3 changes, 1 comment');
  await expect(content(page)).toHaveAttribute('contenteditable', 'true');
}

async function requireFeature(page, selector, feature) {
  if (!await page.locator(selector).count()) throw new Error(`Scene needs feature ${feature}.`);
}

async function pdfSelection(page, words) {
  const span = page.locator('#gr-pdf .textLayer span').filter({ hasText: words }).first();
  await expect(span).toBeVisible();
  await span.evaluate((element, text) => {
    const node = [...element.childNodes].find(child => child.nodeType === Node.TEXT_NODE && child.textContent.includes(text));
    if (!node) throw new Error('PDF selection needs a matching text span.');
    const from = node.textContent.indexOf(text);
    const range = document.createRange();
    range.setStart(node, from);
    range.setEnd(node, from + text.length);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  }, words);
  await expect(page.getByRole('textbox', { name: 'Comment', exact: true })).toBeFocused();
}

async function pdf({ page }) {
  await ready(page);
  await comment(page, 'stones');
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  await expect(page.locator('.gr-pdf-mark').first()).toBeVisible();
  await pdfSelection(page, 'Alpha plants');
}

async function ownerPage({ browser, options, state }) {
  const context = await browser.newContext(options);
  try {
    const page = await context.newPage();
    await page.goto(`${state.base}/login`);
    await page.getByRole('textbox', { name: /Account name|Username|Email/i }).fill(state.owner);
    await page.locator('input[type="password"]').fill(state.password);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page.waitForURL(url => !url.pathname.includes('/login'));
    return { context, page };
  } catch (error) { await context.close(); throw error; }
}

async function waiting(args) {
  const { page, capture } = args;
  await requireFeature(page, '#gloss-review[data-reviewable]', 'F1b and F2');
  await ready(page);
  let lost = false;
  let saveRequests = 0;
  let reviewKey;
  await page.route('**/r/*/review', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    saveRequests++;
    if (!lost) {
      const response = await route.fetch();
      if (!response.ok()) throw new Error('Scene needs a successful F2 save.');
      reviewKey = new URLSearchParams(route.request().postData() ?? '').get('key');
      if (!reviewKey || !/^[A-Za-z0-9]{16}$/.test(reviewKey)) {
        throw new Error('Scene needs a valid reviewer key in the F2 save.');
      }
      lost = true;
      await route.abort('failed');
    } else await route.continue();
  });
  await find(page, 'grow');
  await page.keyboard.insertText('flourish');
  try { await expect(status(page)).toHaveText('Not saved yet; trying again in 2 s', { timeout: 40_000 }); }
  catch (error) { console.log(`H6 status: ${await status(page).textContent()}`); await capture('-diagnostic'); throw error; }
  await capture('-retry');
  await expect(status(page)).toHaveText('Saved', { timeout: 30_000 });
  const owner = await ownerPage(args);
  try {
    await owner.page.goto(`${args.state.base}/index.php/apps/files/?dir=/Review%20reviews`);
    // Dismiss Nextcloud's first-login slideshow before selecting a file.
    const skip = owner.page.getByRole('button', { name: 'Skip', exact: true });
    await skip.waitFor?.({ state: 'visible', timeout: 5000 }).catch(() => {});
    if (await skip.count()) await skip.click();
    await owner.page.waitForTimeout?.(1000);
    const closeWelcome = owner.page.getByRole('button', { name: 'Close', exact: true });
    if (await closeWelcome.count()) await closeWelcome.click();
    const filename = `ada-${createHash('sha256').update(reviewKey).digest('hex').slice(0, 16)}.json`;
    const review = owner.page.locator(`tr[data-cy-files-list-row-name="${filename}"]`);
    await expect(review).toHaveCount(1);
    try { await review.click({ button: 'right' }); }
    catch (error) { await capture('-row-diagnostic', owner.page); console.log(JSON.stringify(await owner.page.getByRole('button').evaluateAll(nodes => nodes.map(n => ({ label: n.getAttribute('aria-label'), text: n.textContent.trim() }))))); throw error; }
    try { await owner.page.getByText('Details', { exact: true }).click(); }
    catch (error) { await capture('-menu-diagnostic', owner.page); throw error; }
    await owner.page.getByRole('tab', { name: 'Versions' }).click();
    await expect(owner.page.getByText('Current version', { exact: true })).toBeVisible();
    const versions = owner.page.locator('[data-cy-files-version-label]');
    await expect(versions.first()).toBeVisible();
    console.log(`Versions after H6: ${await versions.count()} current, ${(await versions.count()) - 1} historical; ${saveRequests} save requests, 1 landed write.`);
    await capture('-versions', owner.page);
  } finally { await owner.context.close(); }
}

async function reviewLink(args) {
  const { page, browser, options, capture, prepareSynthetic } = args;
  await requireFeature(page, '#gloss-review[data-reviewable]', 'F1b and F3');
  await ready(page);
  await find(page, 'grow');
  await page.keyboard.insertText('flourish');
  const link = page.getByRole('textbox', { name: 'Your review link' });
  await expect(link).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeVisible();
  const url = await link.inputValue();
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  // A synthetic HTTP origin may deny the clipboard, so both outcomes are usable.
  await expect(page.locator('.gr-review-link [role="status"]')).toHaveText(/Link copied\.|Copy failed; select the link and copy it\./);
  await capture('-copy');
  if (!/^#[A-Za-z0-9]{16}$/.test(new URL(url).hash)) throw new Error('Scene needs feature F3.');
  const fresh = await browser.newContext(options);
  if (prepareSynthetic) await prepareSynthetic(fresh);
  try {
    const second = await fresh.newPage();
    await second.goto(url);
    await expect(name(second)).toHaveValue(reviewer);
    await expect(second.locator('#gr-text .gr-ins')).toContainText('flourish');
    await capture('-reopened', second);
  } finally { await fresh.close(); }
}

async function proposalCards(page) {
  return page.evaluate(() => [...document.querySelectorAll('.gr-items > li')].filter(li => li.querySelector('ins, del')).map(li => {
    const id = li.dataset.id;
    const spans = [...document.querySelectorAll('#gr-pdf .textLayer span')].map(span => ({ text: span.textContent, rect: span.getBoundingClientRect() }));
    const struck = [...document.querySelectorAll(`.gr-pdf-struck[data-id="${id}"]`)];
    return {
      id,
      deleted: li.querySelector('del')?.textContent ?? '',
      inserted: li.querySelector('ins')?.textContent ?? '',
      line: li.querySelector('.gr-off-pdf')?.textContent ?? null,
      marks: document.querySelectorAll(`.gr-pdf-mark[data-id="${id}"]`).length,
      struck: struck.length,
      carets: [...document.querySelectorAll(`.gr-pdf-caret[data-id="${id}"]`)].map(caret => caret.querySelector('.gr-pdf-label')?.textContent ?? ''),
      under: struck.map(mark => {
        const box = mark.getBoundingClientRect(), x = box.left + box.width / 2, y = box.top + box.height / 2;
        return spans.find(span => x >= span.rect.left && x <= span.rect.right && y >= span.rect.top && y <= span.rect.bottom)?.text ?? '';
      }),
    };
  }));
}

/** Joins each proposal card's data-id to its marks on the PDF page, and the off-PDF card to none. */
async function checkProposalMarks(page) {
  await expect.poll(() => page.locator('.gr-pdf-struck').count()).toBeGreaterThan(0);
  await checkPageNotClipped(page);
  await expect(page.locator('.gr-items > li').filter({ hasText: 'Not shown on the PDF.' })).toBeVisible();
  const expected = [
    { deleted: 'grow', inserted: 'flourish', struck: true, caret: 'flourish' },
    { deleted: 'drift', inserted: '', struck: true, caret: null },
    { deleted: '', inserted: 'softly', struck: false, caret: 'softly' },
    { deleted: 'Observations', inserted: 'Notes', struck: true, caret: 'Notes' },
    { deleted: '', inserted: 'Truly', struck: false, caret: 'Truly' },
  ];
  const cards = await proposalCards(page);
  for (const want of expected) {
    const card = cards.find(c => c.deleted === want.deleted && c.inserted.trim() === want.inserted);
    if (!card) throw new Error(`No proposal card for ${want.deleted || '(insertion)'} ${want.inserted}.`);
    if (card.line) throw new Error(`The ${want.inserted || want.deleted} card says "${card.line}" although it has a place.`);
    if (want.struck && (!card.struck || card.under.some(text => !text.includes(want.deleted)))) throw new Error(`Struck marks of "${want.deleted}" join no or the wrong PDF words: ${JSON.stringify(card)}.`);
    if (!want.struck && card.struck) throw new Error(`The insertion "${want.inserted}" has struck marks.`);
    if (want.caret === null ? card.carets.length : card.carets.length !== 1 || card.carets[0].trim() !== want.caret) throw new Error(`Caret labels of "${want.deleted || want.inserted}" are ${JSON.stringify(card.carets)}.`);
  }
  const theta = cards.find(c => c.deleted === 'Theta');
  if (!theta || theta.line !== 'Not shown on the PDF.' || theta.marks) throw new Error(`The Theta card has no line or has marks: ${JSON.stringify(theta)}.`);
  await expect(page.locator('.gr-pdf-note').first()).toBeVisible();
  await checkCaretHover(page);
  await page.locator('.gr-items > li').filter({ hasText: 'Not shown on the PDF.' }).scrollIntoViewIfNeeded();
}

async function proposals(args, view) {
  const { page, capture } = args;
  await editor(args);
  await find(page, 'Observations');
  await page.keyboard.insertText('Notes');
  await find(page, 'fountain.');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.insertText(' Truly');
  await find(page, 'Theta');
  await page.keyboard.insertText('Iota');
  await expect(page.locator('.gr-items > li').filter({ has: page.locator('ins', { hasText: 'Iota' }) })).toHaveCount(1);
  await expect(status(page)).toHaveText('Saved', { timeout: 30_000 });
  await page.getByRole('button', { name: view, exact: true }).click();
  await expect.poll(async () => (await page.locator('.gr-pdf-note-line').allTextContents()).includes('Showing your PDF while the draft compiles.'), { timeout: 30_000 }).toBe(false);
  await expect(page.locator('#gr-pdf canvas').first()).toBeVisible();
  await checkProposalMarks(page);
  await checkNewText(page);
  await capture('-new');
  await checkLookKept(page, async target => { await expect(target.locator('#gr-pdf canvas').first()).toBeVisible(); await expect.poll(() => target.locator('.gr-pdf-cover').count()).toBeGreaterThan(0); });
  await page.getByRole('button', { name: 'Changes', exact: true }).click();
  await expect.poll(() => page.locator('.gr-pdf-struck').count()).toBeGreaterThan(0);
}

async function long({ page, out, prefix }) {
  await ready(page);
  await content(page).click();
  await page.keyboard.press('Control+Home');
  const times = [];
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => {
      window.__glossTiming = new Promise(resolveTiming => {
        let start;
        const beforeInput = () => { start = performance.now(); };
        document.querySelector('#gr-text .cm-content').addEventListener('beforeinput', beforeInput, { once: true });
        const observer = new MutationObserver(() => {
          if (start === undefined) return;
          observer.disconnect();
          resolveTiming(performance.now() - start);
        });
        observer.observe(document.querySelector('.gr-side'), { childList: true, subtree: true, characterData: true });
        setTimeout(() => {
          observer.disconnect();
          document.querySelector('#gr-text .cm-content').removeEventListener('beforeinput', beforeInput);
          resolveTiming(null);
        }, 5000);
      });
    });
    await page.keyboard.insertText(String.fromCharCode(97 + i));
    const ms = await page.evaluate(() => window.__glossTiming);
    if (ms === null) throw new Error('H11 needs panel updates after each keystroke.');
    times.push(ms);
  }
  await writeFile(resolve(out, `${prefix}-timings.json`), JSON.stringify(times));
  console.log(`H11 keystrokes (ms): ${times.map(ms => ms.toFixed(1)).join(', ')}`);
  expect(Math.max(...times)).toBeLessThan(100);
}

export const scenes = {
  ...liveScenes({ ready, find, comment, content, name, status }),
  editor: { run: editor },
  pdf: { run: pdf },
  'pdf-proposals': { run: args => proposals(args, 'PDF') },
  both: { run: args => proposals(args, 'Both') },
  'latex-proposals': latexScene({ ready, find, status }),
  ...typstScenes({ ready, find, comment, status, content, pdfSelection }),
  search: { run: async ({ page, capture }) => {
    await ready(page);
    await content(page).click();
    await page.keyboard.press('Control+f');
    await page.locator('.cm-search input[name="search"]').fill('the');
    await page.locator('.cm-search input[name="search"]').dispatchEvent('change');
    await expect(page.locator('.cm-searchMatch').first()).toBeVisible();
    await capture('-matches');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+Alt+g');
    await expect(page.locator('.cm-panel input').first()).toBeVisible();
  } },
  'not-set-up': { folder: 'Plain', run: async ({ page }) => {
    await requireFeature(page, '#gloss-review[data-reviewable]', 'F1b');
    await expect(page.getByText('This link is not set up for reviewing.', { exact: true })).toBeVisible();
    await expect(content(page)).toHaveAttribute('contenteditable', 'false');
    await expect(name(page)).toHaveCount(0);
    await expect(send(page)).toHaveCount(0);
  } },
  waiting: { requires: 'F1b and F2', run: waiting },
  'review-link': { requires: 'F1b and F3', run: reviewLink },
  overall: { requires: 'F4', run: async ({ page }) => {
    if (!await page.getByRole('textbox', { name: 'Overall comment' }).count()) throw new Error('Scene needs feature F4.');
    await ready(page);
    const before = await count(page).textContent();
    const box = page.getByRole('textbox', { name: 'Overall comment' });
    await expect(box, 'Scene needs feature F4.').toBeVisible();
    await box.fill('The synthetic garden needs one more observation.');
    await expect(count(page)).toHaveText(before);
    await expect(send(page)).toBeEnabled();
  } },
  bell: { requires: 'F5', run: async args => {
    await editor(args);
    await send(args.page).click();
    await expect(status(args.page)).toHaveText('Review sent. Thank you.');
    const owner = await ownerPage(args);
    try {
      await owner.page.getByRole('button', { name: /Notifications/i }).click();
      await expect(owner.page.getByText(`${reviewer} sent a review of paper.typ`, { exact: false }).first(), 'Scene needs feature F5.').toBeVisible();
      await args.capture('-notification', owner.page);
    } finally { await owner.context.close(); }
  } },
  sent: { run: async args => {
    await editor(args);
    await send(args.page).click();
    await expect(status(args.page)).toHaveText('Review sent. Thank you.');
    await expect(content(args.page)).toHaveAttribute('contenteditable', 'false');
    await expect(args.page.locator('.gr-items button')).toHaveCount(0);
    await sentFileRemoved(args);
  } },
  long: { folder: 'Long', run: long },
};
