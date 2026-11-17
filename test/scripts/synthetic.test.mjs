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

test('the Typst folder serves the compiler worker, wasm, fonts, and the files the draft reads', async () => {
  const base = 'http://gloss.invalid/index.php/apps/gloss/r/synthetic';
  const file = path => `${base}/file?path=${encodeURIComponent(path)}`;
  const [page, worker, wasm, font, missingFont, bib, draft] = await serve('typst-compile', 'Typst', [
    [base], ['http://gloss.invalid/typst.worker.js?v=dev'], ['http://gloss.invalid/typst-compiler.wasm?v=dev'],
    ['http://gloss.invalid/fonts/NewCM10-Regular.otf?v=dev'], ['http://gloss.invalid/fonts/nothing.otf'],
    [file('references.bib')], [`${base}/draft`],
  ]);
  expect(page.body).toContain('data-worker="/pdf.worker.js"');
  expect(worker.contentType).toBe('text/javascript');
  expect(Buffer.from(wasm.body).equals(await readFile('js/typst-compiler.wasm'))).toBe(true);
  expect(wasm.contentType).toBe('application/wasm');
  expect(Buffer.from(font.body).equals(await readFile('fonts/NewCM10-Regular.otf'))).toBe(true);
  expect(missingFont).toBe('aborted');
  expect(Buffer.from(bib.body).equals(await readFile('test/fixtures/nc/Typst/references.bib'))).toBe(true);
  expect(draft.json.main).toBe('paper.typ');
});

test('the file route refuses what the server refuses', async () => {
  const base = 'http://gloss.invalid/index.php/apps/gloss/r/synthetic';
  const file = path => [`${base}/file?path=${encodeURIComponent(path)}`];
  const paths = ['../paper.typ', 'a/../paper.typ', '/etc/passwd', '.gloss-review/x.json', '.hidden', 'a\\b', 'a\0b', '', 'a//b', 'x/'.repeat(17) + 'y', 'nothing.bib'];
  const replies = await serve('typst-compile', 'Typst', paths.map(file));
  for (const reply of replies) expect(reply.status).toBe(404);
});

test('typst-fallback opens the draft that imports a package', async () => {
  const base = 'http://gloss.invalid/index.php/apps/gloss/r/synthetic';
  const [draft] = await serve('typst-fallback', 'Typst', [[`${base}/draft`]]);
  expect(draft.json.main).toBe('zz-package.typ');
  expect(draft.json.files[0].text).toContain('#import "@preview/');
  expect(syntheticScenes).toEqual(expect.arrayContaining(['typst-compile', 'typst-fallback']));
  expect(scenes['typst-compile'].folder).toBe('Typst');
  expect(scenes['typst-fallback'].folder).toBe('Typst');
});

test('the synthetic page carries the app\'s policy: scripts and workers from the page only, no eval, no wasm allowance', async () => {
  const [page] = await serve('typst-compile', 'Typst', [['http://gloss.invalid/index.php/apps/gloss/r/synthetic']]);
  const policy = page.headers['Content-Security-Policy'];
  expect(policy).toContain("script-src 'self'");
  expect(policy).toContain("worker-src 'self'");
  expect(policy).not.toMatch(/unsafe-eval/);
});

test('the Typst limit scenes carry drafts that cannot compile live, and are synthetic scenes', async () => {
  for (const name of ['typst-error', 'typst-lines', 'typst-proposals', 'typst-no-fonts']) {
    expect(syntheticScenes).toContain(name);
    expect(scenes[name].folder).toBe('Typst');
  }
  const { limits } = await import('../../src/domain/typst/limits.ts').then(m => ({ limits: m }));
  const lines = await scenes['typst-lines'].draft();
  expect(limits.tooLargeToCompile(lines.text, 0)).toBe(true);
  const words = await scenes['typst-proposals'].draft();
  expect(words.text.split('\n')[0].split(' ')).toHaveLength(4010);
  expect(limits.tooLargeToCompile(words.text, 0)).toBe(false);
  expect((await scenes['typst-error'].draft()).text).toContain('#let broken = (1,');
});
