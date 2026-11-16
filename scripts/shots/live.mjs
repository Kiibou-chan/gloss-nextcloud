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
export async function sentFileRemoved({ page, state, capture }) {
  const link = await page.getByRole('textbox', { name: 'Your review link' }).inputValue();
  await capture('-before-delete');
  await ownerRequest(state, await reviewFile(state), { method: 'DELETE' });
  await page.goto('about:blank');
  await page.goto(link, { waitUntil: 'networkidle' });
  await expect(page.getByRole('status')).toHaveText('Review sent. Thank you.');
  await expect(page.locator('#gr-text .cm-content')).toHaveAttribute('contenteditable', 'false');
  await expect(page.locator('.gr-items button')).toHaveCount(0);
  await page.waitForTimeout(2000);
  const listing = await (await ownerRequest(state, dav('Review%20reviews/'), { method: 'PROPFIND', headers: { Depth: '1' } })).text();
  expect([...listing.matchAll(/<(?:\w+:)?href>([^<]+\.json)<\/(?:\w+:)?href>/g)]).toHaveLength(0);
  console.log('Sent deletion probe: sent, read-only, and zero review files after reopening.');
  await capture('-after-delete');
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
  await expect(page.locator('#gr-text .cm-content')).toBeVisible();
  if (new URL(link).hash) expect(new URL(page.url()).hash).toBe(new URL(link).hash);
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
        const navigation = await page.goto(link, { waitUntil: 'networkidle' });
        console.log(`Password direct Gloss probe: HTTP ${navigation.status()}, password inputs ${await page.locator('input[type="password"]').count()}.`);
        await expect(page.locator('input[type="password"]')).toBeVisible();
        await capture('-direct');
        await expect(page.locator('input[type="password"]')).toBeVisible();
        expect(new URL(page.url()).pathname).toContain('/apps/gloss/r/');
        await capture('-password');
        await passwordPrompt(page, password, link);
        await ready(page);
        await find(page, 'grow');
        await page.keyboard.insertText('flourish');
        await saved(page);
        const reviewLink = await page.getByRole('textbox', { name: 'Your review link' }).inputValue();
        await capture('-saved');
        const otherDevice = await context.browser().newContext({ colorScheme: await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'), viewport: { width: 1600, height: 1000 } });
        try {
          const reviewer = await otherDevice.newPage();
          await reviewer.goto(reviewLink, { waitUntil: 'networkidle' });
          await passwordPrompt(reviewer, password, reviewLink);
          await expect(name(reviewer)).toHaveValue('Ada Example');
          await expect(content(reviewer)).toContainText('flourish');
          await expect(reviewer.getByRole('textbox', { name: 'Your review link' })).toHaveValue(reviewLink);
          await capture('-other-device', reviewer);
        } finally { await otherDevice.close(); await page.bringToFront(); }
        await recoverStaleToken(page, async () => {
          await page.getByRole('textbox', { name: 'Overall comment' }).fill('Synthetic stale-token recovery.');
          await saved(page);
        });
        await capture('-csrf-refreshed');
        // Reopen the plain link after another password prompt, with no review hash.
        // N2 must preserve the same review across every path form the server serves.
        let reopened = 0;
        let lastServed = page.url();
        for (const front of ['/index.php', '']) {
          const plain = `${state.base}${front}/apps/gloss/r/${share.data.token}`;
          await page.goto('about:blank');
          for (const cookie of await context.cookies()) {
            if (!cookie.name.toLowerCase().startsWith('gloss')) await context.clearCookies({ name: cookie.name, domain: cookie.domain, path: cookie.path });
          }
          const navigation = await page.goto(plain, { waitUntil: 'networkidle' });
          if (navigation.status() === 404) {
            console.log(`Plain-link reopen: ${front || 'pretty'} form is not served (404).`);
            await page.goto(lastServed, { waitUntil: 'networkidle' });
            continue;
          }
          expect(navigation.status()).toBe(200);
          await passwordPrompt(page, password, plain);
          await expect(name(page)).toHaveValue('Ada Example');
          await expect(content(page)).toContainText('flourish');
          await expect(page.getByRole('textbox', { name: 'Overall comment' })).toHaveValue('Synthetic stale-token recovery.');
          const reopenedLink = await page.getByRole('textbox', { name: 'Your review link' }).inputValue();
          expect(new URL(reopenedLink).hash).toBe(new URL(reviewLink).hash);
          lastServed = plain;
          await capture(front ? '-reopened-index' : '-reopened-pretty');
          reopened++;
        }
        expect(reopened).toBeGreaterThan(0);
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
        await page.goto('about:blank');
        await page.goto(reviewLink, { waitUntil: 'networkidle' });
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
      const originalText = await content(page).textContent();
      await content(page).click();
      await page.keyboard.press('x');
      await expect(status(page)).toHaveText('Enter your name first.');
      await expect(name(page)).toBeFocused();
      await expect(name(page)).toHaveValue('');
      await expect(content(page)).toHaveText(originalText);
      const typography = () => content(page).evaluate(element => {
        const style = getComputedStyle(element);
        const lines = [...element.querySelectorAll('.cm-line')];
        return { fontSize: style.fontSize, lineHeight: style.lineHeight,
          pitch: lines.length > 1 ? lines[1].getBoundingClientRect().top - lines[0].getBoundingClientRect().top : null };
      });
      const readOnly = await typography();
      await capture('-name');
      await page.getByRole('textbox', { name: 'Overall comment' }).press('x');
      await expect(name(page)).toBeFocused();
      await expect(name(page)).toHaveValue('');
      await ready(page);
      const named = await typography();
      console.log(`Editor typography before: ${JSON.stringify(readOnly)}; after: ${JSON.stringify(named)}.`);
      expect(named).toEqual(readOnly);
      await capture('-named');
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
        await find(page, 'stones');
        await page.keyboard.insertText('pebbles');
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
        await expect(page.getByRole('region', { name: 'Could not place' })).toContainText('pebbles');
        await saved(page);
        await capture('-missing');
        const write = page.waitForResponse(response => response.request().method() === 'POST' && /\/review$/.test(new URL(response.url()).pathname) && response.ok());
        await page.getByRole('textbox', { name: 'Overall comment' }).fill('Synthetic follow-up after the draft changed.');
        await write;
        await saved(page);
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

// Exercise the supplied template URL without changing it, and require the full recovery order.
export async function recoverStaleToken(page, change) {
  const csrfUrl = await page.locator('#gloss-review').getAttribute('data-csrf-token-url');
  expect(csrfUrl).toBeTruthy();
  const supplied = new URL(csrfUrl, page.url()).href;
  const replies = [];
  const response = reply => {
    if (reply.url() === supplied) replies.push({ kind: 'refresh', status: reply.status() });
    else if (reply.request().method() === 'POST' && /\/review$/.test(new URL(reply.url()).pathname)) {
      replies.push({ kind: 'save', status: reply.status() });
    }
  };
  let staleOnce = true;
  const staleRoute = async route => {
    if (staleOnce) {
      staleOnce = false;
      await route.continue({ headers: { ...route.request().headers(), requesttoken: 'synthetic-stale-token' } });
    } else await route.continue();
  };
  page.on('response', response);
  await page.route('**/review', staleRoute);
  try {
    await change();
    expect(staleOnce).toBe(false);
    expect(replies).toEqual([
      { kind: 'save', status: 412 },
      { kind: 'refresh', status: 200 },
      { kind: 'save', status: 200 },
    ]);
    console.log(`CSRF recovery probe: 412, refresh 200, retry 200 via ${new URL(supplied).pathname}.`);
  } finally {
    await page.unroute('**/review', staleRoute);
    page.off('response', response);
  }
}
