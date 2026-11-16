// @vitest-environment node
import { expect, test, vi } from 'vitest';

vi.mock('@playwright/test', () => ({ expect: () => ({}) }));

import { readFile } from 'node:fs/promises';
import { syntheticScenes, syntheticRoutes } from '../../scripts/shots/synthetic.mjs';
import { scenes } from '../../scripts/shots/scenes.mjs';

async function serve(sceneName, folder, requests) {
  let handler;
  const context = { route: async (_pattern, callback) => { handler = callback; } };
  await syntheticRoutes(context, sceneName, new Map(), folder);
  const out = [];
  for (const [url, method = 'GET', postData = ''] of requests) {
    let reply;
    await handler({
      request: () => ({ url: () => url, method: () => method, postData: () => postData }),
      fulfill: async value => { reply = value; },
      abort: async () => { reply = 'aborted'; },
    });
    out.push(reply);
  }
  return out;
}

test('the synthetic fixture mode accepts the pdf-proposals and both scenes', () => {
  for (const name of ['overall', 'review-link', 'pdf-proposals', 'both']) expect(syntheticScenes).toContain(name);
  expect(scenes['pdf-proposals']).toBeDefined();
});

test('the Typst fixture ends in a comment whose words are not on the PDF', async () => {
  const source = await readFile('test/fixtures/nc/Review/paper.typ', 'utf8');
  expect(source.trimEnd().split('\n').at(-1)).toBe('// Theta notes stay in the source only.');
});

test('pdf-proposals routes serve the page, bundle, worker, draft, PDF, and the review routes', async () => {
  const base = 'http://gloss.invalid/index.php/apps/gloss/r/synthetic';
  const [page, bundle, worker, draft, pdf, open, save, other] = await serve('pdf-proposals', 'Review', [
    [base], ['http://gloss.invalid/gloss-review.js'], ['http://gloss.invalid/pdf.worker.js'], [`${base}/draft`], [`${base}/pdf`],
    [`${base}/review/open`, 'POST', 'key=k'],
    [`${base}/review`, 'POST', `key=k&baseRevision=2&review=${encodeURIComponent('{"revision":3}')}`],
    ['http://gloss.invalid/elsewhere'],
  ]);
  expect(page.body).toContain('data-has-pdf="1"');
  expect(page.body).toContain('data-worker="/pdf.worker.js"');
  expect(bundle.contentType).toBe('text/javascript');
  expect(worker.contentType).toBe('text/javascript');
  expect(draft.json.main).toBe('paper.typ');
  expect(draft.json.files[0].text.trimEnd().split('\n').at(-1)).toBe('// Theta notes stay in the source only.');
  expect(Buffer.from(pdf.body).equals(await readFile('test/fixtures/nc/Review/paper.pdf'))).toBe(true);
  expect(pdf.contentType).toBe('application/pdf');
  expect(open.json).toEqual({ review: null });
  expect(save.json).toEqual({ revision: 3 });
  expect(other).toBe('aborted');
});

test('the overall scene keeps its garden draft and no PDF', async () => {
  const base = 'http://gloss.invalid/index.php/apps/gloss/r/synthetic';
  const [page, draft] = await serve('overall', 'Review', [[base], [`${base}/draft`]]);
  expect(page.body).toContain('data-has-pdf="0"');
  expect(draft.json.main).toBe('garden.txt');
});
