import { expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// Owner credentials stay in the runner's memory and never enter a URL or diagnostic.
async function ownerRequest(state, path, options = {}) {
  const response = await fetch(`${state.base}${path}`, {
    ...options,
    headers: { Authorization: `Basic ${Buffer.from(`${state.owner}:${state.password}`).toString('base64')}`, 'OCS-APIRequest': 'true', ...options.headers },
  });
  if (!response.ok) throw new Error('Owner fixture request failed.');
  return response;
}
const dav = path => `/remote.php/dav/files/gloss-owner/${path}`;
async function reviewFile(state) {
  const response = await ownerRequest(state, dav('Review%20reviews/'), { method: 'PROPFIND', headers: { Depth: '1' } });
  const xml = await response.text();
  const paths = [...xml.matchAll(/<(?:\w+:)?href>([^<]+\.json)<\/(?:\w+:)?href>/g)].map(match => match[1].replaceAll('&amp;', '&'));
  expect(paths).toHaveLength(1);
  return paths[0];
}
async function saved(page, timeout = 20_000) {
  await expect(page.getByRole('status')).toHaveText('Saved', { timeout });
}
async function passwordPrompt(page, password, link) {
  const box = page.locator('input[type="password"]');
  await expect(box).toBeVisible();
  await box.fill(password);
  await box.press('Enter');
  await expect(box).toBeHidden({ timeout: 20_000 });
  await page.goto(link, { waitUntil: 'networkidle' });
  await expect(page.locator('#gr-text .cm-content')).toBeVisible();
}

export function liveScenes({ ready, find, comment, content, name, status }) {
  return {
    'password-lapse': { navigate: false, run: async ({ page, context, state, capture }) => {
      const password = randomBytes(24).toString('hex');
      const response = await ownerRequest(state, '/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json', {
        method: 'POST', body: new URLSearchParams({ path: '/Review', shareType: '3', permissions: '1', password }),
      });
      const share = (await response.json()).ocs;
      expect([100, 200]).toContain(share.meta.statuscode);
      const link = `${state.base}/index.php/apps/gloss/r/${share.data.token}`;
      let requests = 0;
      const replies = [];
      page.on('request', request => { if (request.method() === 'POST' && /\/review$/.test(new URL(request.url()).pathname)) requests++; });
      page.on('response', response => { if (response.request().method() === 'POST' && /\/review$/.test(new URL(response.url()).pathname)) replies.push(response.status()); });
      try {
        const metadata = (await (await ownerRequest(state, `/ocs/v2.php/apps/files_sharing/api/v1/shares/${share.data.id}?format=json`)).json()).ocs.data;
        const current = Array.isArray(metadata) ? metadata[0] : metadata;
        expect(current.token).toBe(share.data.token);
        console.log(`Password share metadata probe: requested permissions=1, reported=${Number(current.permissions)}, password configured=${Boolean(current.password)}.`);
        expect(Number(current.permissions) & 15).toBe(1);
        const stockLink = `${state.base}/index.php/s/${share.data.token}`;
        const navigation = await page.goto(link, { waitUntil: 'networkidle' });
        console.log(`Password direct Gloss probe: HTTP ${navigation.status()}, password inputs ${await page.locator('input[type="password"]').count()}.`);
        await capture('-direct');
        const stock = await page.goto(stockLink, { waitUntil: 'networkidle' });
        await expect(page.locator('input[type="password"]')).toBeVisible();
        console.log(`Password stock route probe: HTTP ${stock.status()}, password prompt visible.`);
        await capture('-password');
        await passwordPrompt(page, password, link);
        await ready(page);
        await find(page, 'grow');
        await page.keyboard.insertText('flourish');
        await saved(page);
        const reviewLink = await page.getByRole('textbox', { name: 'Your review link' }).inputValue();
        await capture('-saved');
        const cookies = await context.cookies();
        // Gloss uses browser storage for backups, and sets no authentication cookies.
        for (const cookie of cookies.filter(cookie => !cookie.name.toLowerCase().startsWith('gloss'))) {
          await context.clearCookies({ name: cookie.name, domain: cookie.domain, path: cookie.path });
        }
        await find(page, 'sing');
        await page.keyboard.insertText('warble');
        const messageSource = await readFile(new URL('../../src/app/messages.ts', import.meta.url), 'utf8');
        const sentence = messageSource.match(/SESSION_ENDED = '([^']+)'/)[1];
        const failures = [];
        try { await expect(status(page)).toHaveText(sentence, { timeout: 20_000 }); }
        catch { failures.push('The session-ended sentence was not shown.'); }
        const stopped = requests;
        await page.waitForTimeout(6500);
        if (requests !== stopped) failures.push('Save requests continued after the session lapsed.');
        console.log(`Password lapse probe: ${requests} save requests, replies ${replies.join(', ')}, stable for 6.5 s.`);
        await capture('-ended');
        page.on('dialog', dialog => dialog.accept());
        await page.goto(stockLink, { waitUntil: 'networkidle' });
        await passwordPrompt(page, password, reviewLink);
        await expect(name(page)).toHaveValue('Ada Example');
        await expect(content(page)).toContainText('flourish');
        await expect(content(page)).toContainText('warble');
        await saved(page);
        const raw = await (await ownerRequest(state, await reviewFile(state))).text();
        expect(raw).toContain('flourish');
        expect(raw).toContain('warble');
        await capture('-restored');
        for (const failure of failures) console.log(`Password lapse assertion failed: ${failure}`);
        if (failures.length) throw new Error('Password lapse assertions failed; see the ended-state shot and request probe.');
      } finally {
        console.log(`Password save probe: ${requests} requests, HTTP ${replies.join(', ')}.`);
        await ownerRequest(state, `/ocs/v2.php/apps/files_sharing/api/v1/shares/${share.data.id}?format=json`, { method: 'DELETE' });
      }
    } },
    'input-prompts': { run: async ({ page, capture }) => {
      await expect(content(page)).toBeVisible();
      await content(page).click();
      await page.keyboard.press('x');
      await expect(status(page)).toHaveText('Enter your name first.');
      await expect(name(page)).toBeFocused();
      await capture('-name');
      await ready(page);
      await content(page).click();
      await page.keyboard.press('Control+a');
      await expect(page.locator('#gr-comment')).toBeHidden();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Shift+ArrowLeft');
      await expect(page.locator('#gr-comment')).toBeHidden();
      await capture('-keyboard');
      const line = content(page).locator('.cm-line').filter({ hasText: 'Alpha plants' });
      const box = await line.boundingBox();
      await page.mouse.move(box.x + 3, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + 90, box.y + box.height / 2, { steps: 12 });
      await page.mouse.up();
      await expect(page.locator('#gr-comment')).toBeVisible();
      await capture('-pointer');
    } },
    unplaced: { run: async ({ page, state, capture }) => {
      const draftPath = dav('Review/paper.typ');
      const original = await (await ownerRequest(state, draftPath)).text();
      try {
        await ready(page);
        await comment(page, 'stones');
        await saved(page);
        const path = await reviewFile(state);
        const before = await (await ownerRequest(state, path)).text();
        const item = JSON.parse(before).items.find(item => item.quote?.exact === 'stones');
        expect(item).toBeTruthy();
        // Keep the exact serialised item as evidence, including whitespace and escapes.
        const itemText = JSON.stringify(item);
        await capture('-saved');
        await ownerRequest(state, draftPath, { method: 'PUT', body: original.replace('Delta stones rest beneath the willow.', 'A synthetic pond reflects the moon.') });
        await page.reload({ waitUntil: 'networkidle' });
        await expect(page.getByRole('region', { name: 'Could not place' })).toContainText('stones');
        await capture('-missing');
        const write = page.waitForResponse(response => response.request().method() === 'POST' && /\/review$/.test(new URL(response.url()).pathname) && response.ok());
        await page.getByRole('textbox', { name: 'Overall comment' }).fill('Synthetic follow-up after the draft changed.');
        await write;
        const after = await (await ownerRequest(state, path)).text();
        expect(JSON.stringify(JSON.parse(after).items.find(value => value.id === item.id))).toBe(itemText);
        // Extract the complete object with balanced JSON, respecting strings and escapes.
        expect(rawItem(after, item.id)).toBe(rawItem(before, item.id));
        console.log(`Unplaced probe: raw item preserved byte for byte (${Buffer.byteLength(rawItem(before, item.id))} bytes).`);
        await capture('-preserved');
      } finally { await ownerRequest(state, draftPath, { method: 'PUT', body: original }); }
    } },
  };
}

// Scan the items array without re-encoding its objects.
export function rawItem(text, id) {
  let depth = 0, quoted = false, escaped = false, start = -1;
  for (let i = text.indexOf('[', text.indexOf('"items"')) + 1; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; }
    else if (c === '"') quoted = true;
    else if (c === '{') { if (depth++ === 0) start = i; }
    else if (c === '}' && --depth === 0) {
      const raw = text.slice(start, i + 1);
      if (JSON.parse(raw).id === id) return raw;
    } else if (c === ']' && depth === 0) break;
  }
  throw new Error('Review item missing.');
}
