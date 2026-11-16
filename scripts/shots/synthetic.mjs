// The route-mocked synthetic mode: the real bundle and adapters against a page and API simulated in the browser context.
import { readFile, readdir } from 'node:fs/promises';

export const syntheticScenes = ['overall', 'review-link', 'pdf-proposals', 'both', 'latex-proposals', 'typst-compile', 'typst-fallback'];
const gardenScenes = ['overall', 'review-link'];
const root = new URL('../../', import.meta.url);
const fixtureMain = { Review: 'paper.typ', Latex: 'paper.tex', Typst: 'paper.typ' };
const sceneMain = { 'typst-fallback': 'zz-package.typ' };

/** What the server's SharedPath refuses: an empty, absolute, backslash, NUL, dot-led, empty-segment, long, or deep path. */
export function refusedPath(path) {
  if (!path || path.startsWith('/') || path.includes('\\') || path.includes('\0')) return true;
  if (Buffer.byteLength(path) > 512) return true;
  const segments = path.split('/');
  return segments.length > 16 || segments.some(segment => segment === '' || segment.startsWith('.'));
}

async function fixtureFiles(sceneName, folder, draft) {
  if (gardenScenes.includes(sceneName)) {
    return { main: 'garden.txt', text: 'Synthetic garden observations.\nThe seedlings grow beside the window.\n', pdf: null };
  }
  const dir = new URL(`test/fixtures/nc/${folder}/`, root);
  const main = draft?.main ?? sceneMain[sceneName] ?? fixtureMain[folder];
  if (!main) throw new Error(`No synthetic fixture for the ${folder} folder.`);
  return { main, text: draft?.text ?? await readFile(new URL(main, dir), 'utf8'), pdf: await readFile(new URL('paper.pdf', dir)) };
}

function pageHtml(sceneName, css, pdfCss, withPdf) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Synthetic review fixture</title>
    <style>
      :root { color-scheme: light dark; --color-main-background: #fff; --color-main-text: #222; --color-text-maxcontrast: #555; --color-border: #bbb; --color-background-hover: #eee; --color-primary-element: #006da3; --color-primary-element-text: #fff; --color-primary-element-light: #d9edf8; --border-radius: 6px; --border-radius-large: 10px; }
      @media (prefers-color-scheme: dark) { :root { --color-main-background: #181818; --color-main-text: #eee; --color-text-maxcontrast: #bbb; --color-border: #666; --color-background-hover: #292929; --color-primary-element: #80cfff; --color-primary-element-text: #00293d; --color-primary-element-light: #244459; } }
      body { margin: 32px; font: 16px/1.5 system-ui; background: var(--color-main-background); color: var(--color-main-text); }
      input, textarea, button { box-sizing: border-box; font: inherit; padding: 8px; color: inherit; background: var(--color-main-background); border: 1px solid var(--color-border); border-radius: 6px; }
      label { display: flex; flex-direction: column; } button:enabled { cursor: pointer; } button:disabled { opacity: .5; }
      ${pdfCss}
      ${css}
    </style><body><p>Synthetic ${sceneName} fixture, with the application bundle and simulated API.</p>
    <div id="gloss-review" data-token="synthetic" data-reviewable="1" data-has-pdf="${withPdf ? 1 : 0}"${withPdf ? ' data-worker="/pdf.worker.js"' : ''} data-view="editor">
      <header class="gr-head"></header><main class="gr-body"><article id="gr-text" class="gr-text"></article><article id="gr-pdf" class="gr-pdf" hidden></article><aside class="gr-side"></aside></main>
    </div><script src="/gloss-review.js"></script></body></html>`;
}

/** `draft` ({ main, text }) replaces the fixture's draft text; the fixture folder's PDF still stands in for the uploaded one. */
export async function syntheticRoutes(context, sceneName, reviews, folder = 'Review', draft = null) {
  const [script, css, files] = await Promise.all([
    readFile(new URL('js/gloss-review.js', root), 'utf8'), readFile(new URL('css/review.css', root), 'utf8'), fixtureFiles(sceneName, folder, draft),
  ]);
  const withPdf = files.pdf !== null;
  const typst = folder === 'Typst' && sceneName.startsWith('typst-');
  const [typstWorker, typstWasm, fonts] = typst
    ? await Promise.all([readFile(new URL('js/typst.worker.js', root), 'utf8'), readFile(new URL('js/typst-compiler.wasm', root)), readdir(new URL('fonts/', root))])
    : [null, null, []];
  const fixtureDir = new URL('test/fixtures/nc/Typst/', root);
  const [worker, pdfCss] = withPdf
    ? await Promise.all([readFile(new URL('js/pdf.worker.js', root), 'utf8'), readFile(new URL('css/pdf-text-layer.css', root), 'utf8')])
    : ['', ''];
  const html = pageHtml(sceneName, css, pdfCss, withPdf);
  await context.route('http://gloss.invalid/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/gloss-review.js') return route.fulfill({ contentType: 'text/javascript', body: script });
    if (withPdf && path === '/pdf.worker.js') return route.fulfill({ contentType: 'text/javascript', body: worker });
    if (withPdf && path.endsWith('/pdf')) return route.fulfill({ contentType: 'application/pdf', body: files.pdf });
    if (typst && path === '/typst.worker.js') return route.fulfill({ contentType: 'text/javascript', body: typstWorker });
    if (typst && path === '/typst-compiler.wasm') return route.fulfill({ contentType: 'application/wasm', body: typstWasm });
    if (typst && path.startsWith('/fonts/') && fonts.includes(path.slice(7)) && path !== '/fonts/NOTICE') return route.fulfill({ contentType: 'application/octet-stream', body: await readFile(new URL(`fonts/${path.slice(7)}`, root)) });
    if (typst && path.endsWith('/file')) {
      const wanted = new URL(route.request().url()).searchParams.get('path') ?? '';
      const body = refusedPath(wanted) ? null : await readFile(new URL(wanted, fixtureDir)).catch(() => null);
      return body ? route.fulfill({ contentType: 'application/octet-stream', body }) : route.fulfill({ status: 404, json: { error: 'The draft reads a file this link cannot serve.' } });
    }
    if (path.endsWith('/draft')) return route.fulfill({ json: { main: files.main, files: [{ file: files.main, text: files.text, etag: 'synthetic-v1' }] } });
    if (path.endsWith('/review/open')) {
      const params = new URLSearchParams(route.request().postData() ?? '');
      const review = reviews.get(params.get('key')) ?? null;
      return route.fulfill({ json: review ? { review, revision: review.revision } : { review: null } });
    }
    if (path.endsWith('/review')) {
      const params = new URLSearchParams(route.request().postData() ?? '');
      const review = JSON.parse(params.get('review'));
      reviews.set(params.get('key'), review);
      return route.fulfill({ json: { revision: Number(params.get('baseRevision')) + 1 } });
    }
    if (path.endsWith('/synthetic')) return route.fulfill({ contentType: 'text/html', headers: { 'Content-Security-Policy': "script-src 'self'; worker-src 'self'; object-src 'none'" }, body: html });
    return route.abort();
  });
}
