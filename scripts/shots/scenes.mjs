// S11b mocks interim review open/save only; remove the mock when F1b lands.
import { expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const reviewer = 'Ada Example';
const content = page => page.locator('#gr-text .cm-content');
const count = page => page.locator('.gr-count');
const status = page => page.getByRole('status');
const name = page => page.getByRole('textbox', { name: 'Your name' });
const send = page => page.getByRole('button', { name: 'Send review', exact: true });

async function interimReview(page) {
  await page.route('**/r/*/review*', route => {
    const request = route.request();
    return route.fulfill({ status: 200, contentType: 'application/json', body: request.method() === 'POST' ? '{"saved":true}' : 'null' });
  });
}

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
  await page.locator('#gr-text').dispatchEvent('mouseup');
  await expect(page.getByRole('textbox', { name: 'Comment', exact: true })).toBeVisible();
  await expect(page.locator('.gr-form blockquote')).toHaveText(word);
  await page.getByRole('textbox', { name: 'Comment', exact: true }).fill('Please clarify this synthetic observation.');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
}

async function editor({ page }) {
  await interimReview(page);
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
  await interimReview(page);
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
    await page.getByRole('button', { name: /Log in/i }).click();
    await page.waitForURL(url => !url.pathname.includes('/login'));
    return { context, page };
  } catch (error) { await context.close(); throw error; }
}

async function waiting(args) {
  const { page, capture } = args;
  await requireFeature(page, '#gloss-review[data-reviewable]', 'F1b and F2');
  await ready(page);
  let lost = false;
  let reviewKey;
  await page.route('**/r/*/review', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    if (!lost) {
      const response = await route.fetch();
      if (!response.ok()) throw new Error('Scene needs a successful F2 save.');
      reviewKey = new URLSearchParams(route.request().postData() ?? '').get('reviewer');
      if (!reviewKey || reviewKey.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(reviewKey)) {
        throw new Error('Scene needs a valid reviewer key in the F2 save.');
      }
      lost = true;
      await route.abort('failed');
    } else await route.continue();
  });
  await find(page, 'grow');
  await page.keyboard.insertText('flourish');
  await expect(status(page)).toHaveText('Not saved yet; trying again in 2 s');
  await capture('-retry');
  await expect(status(page)).toHaveText('Saved', { timeout: 25_000 });
  const owner = await ownerPage(args);
  try {
    await owner.page.goto(`${args.state.base}/index.php/apps/files/?dir=/Review%20reviews`);
    const review = owner.page.locator('[data-cy-files-list-row-name]').filter({
      has: owner.page.getByText(`${reviewKey}.json`, { exact: true }),
    });
    await expect(review).toHaveCount(1);
    await review.click({ button: 'right' });
    await owner.page.getByText('Details', { exact: true }).click();
    await owner.page.getByRole('tab', { name: 'Versions' }).click();
    const versions = owner.page.locator('[data-cy-version]');
    await expect(versions.first()).toBeVisible();
    console.log(`Versions after H6: ${await versions.count()}`);
    await capture('-versions', owner.page);
  } finally { await owner.context.close(); }
}

async function reviewLink(args) {
  const { page, browser, options, capture } = args;
  await requireFeature(page, '#gloss-review[data-reviewable]', 'F1b and F3');
  await ready(page);
  await find(page, 'grow');
  await page.keyboard.insertText('flourish');
  const link = page.getByRole('textbox', { name: 'Your review link' });
  await expect(link).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeVisible();
  const url = await link.inputValue();
  if (!/^#[A-Za-z0-9]{16}$/.test(new URL(url).hash)) throw new Error('Scene needs feature F3.');
  const fresh = await browser.newContext(options);
  try {
    const second = await fresh.newPage();
    await second.goto(url);
    await expect(name(second)).toHaveValue(reviewer);
    await expect(second.locator('#gr-text .gr-ins')).toContainText('flourish');
    await capture('-reopened', second);
  } finally { await fresh.close(); }
}

async function long({ page, out, prefix }) {
  await interimReview(page);
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
  editor: { run: editor },
  pdf: { run: pdf },
  both: { run: async args => {
    await editor(args);
    await args.page.getByRole('button', { name: 'Both', exact: true }).click();
    await expect(args.page.locator('#gr-pdf canvas').first()).toBeVisible();
  } },
  search: { run: async ({ page, capture }) => {
    await interimReview(page);
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
      await expect(owner.page.getByText(`${reviewer} sent a review of paper.typ`, { exact: false }), 'Scene needs feature F5.').toBeVisible();
      await args.capture('-notification', owner.page);
    } finally { await owner.context.close(); }
  } },
  sent: { run: async args => {
    await editor(args);
    await send(args.page).click();
    await expect(status(args.page)).toHaveText('Review sent. Thank you.');
    await expect(content(args.page)).toHaveAttribute('contenteditable', 'false');
    await expect(args.page.locator('.gr-items button')).toHaveCount(0);
  } },
  long: { folder: 'Long', run: long },
};
