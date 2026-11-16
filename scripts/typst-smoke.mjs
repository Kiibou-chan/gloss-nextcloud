// Gate G1: the built Typst worker compiles in a real browser, offline, against synthetic fixtures.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root));
const FONTS = (await import('node:fs')).readdirSync(new URL('fonts/', root)).filter(name => name !== 'NOTICE');
const fixture = await read('test/fixtures/nc/Typst/paper.typ').then(String);
const bib = await read('test/fixtures/nc/Typst/references.bib').then(String);
const proposals = await read('test/fixtures/nc/Review/paper.typ').then(String);
const wrapped = '#let gloss-review-del(body) = strike(stroke: red, body)\n#let gloss-review-ins(body) = underline(body)\n= Heading #gloss-review-del[old];#gloss-review-ins[new];\n\nAlpha plants grow#gloss-review-del[ beside];#gloss-review-ins[ near]; the river.\n\n- item #gloss-review-ins[added];.\n\nA footnote#footnote[Text #gloss-review-ins[extra];.] here (x)#gloss-review-ins[(y)]; and a#gloss-review-ins[b];[c].\n';

const aborted = [];
const browser = await chromium.launch();
const context = await browser.newContext();
await context.route(url => url.hostname !== 'gloss.invalid', route => { aborted.push(route.request().url()); return route.abort(); });
await context.route('http://gloss.invalid/**', async route => {
  const path = new URL(route.request().url()).pathname;
  const file = {
    '/js/typst.worker.js': ['js/typst.worker.js', 'text/javascript'], '/js/typst-compiler.wasm': ['js/typst-compiler.wasm', 'application/wasm'],
    '/js/pdf.worker.js': ['js/pdf.worker.js', 'text/javascript'], '/pdf.mjs': ['node_modules/pdfjs-dist/build/pdf.mjs', 'text/javascript'],
  }[path] ?? (path.startsWith('/fonts/') && FONTS.includes(path.slice(7)) ? [path.slice(1), 'application/octet-stream'] : null);
  if (path === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>typst smoke</title>' });
  if (!file) return route.fulfill({ status: 404 });
  return route.fulfill({ contentType: file[1], body: await read(file[0]) });
});
const page = await context.newPage();
page.on('console', message => { if (message.type() === 'error') console.log('page console error:', message.text()); });
await page.goto('http://gloss.invalid/');

const report = await page.evaluate(async ({ fonts, fixture, bib, proposals, wrapped, pdfModule }) => {
  const worker = new Worker('/js/typst.worker.js?v=smoke', { type: 'module' });
  const pending = new Map();
  worker.addEventListener('message', event => pending.get(event.data.id)?.(event.data));
  worker.addEventListener('error', event => pending.forEach(done => done({ workerError: event.message })));
  worker.postMessage({ type: 'init', wasmUrl: '/js/typst-compiler.wasm', fontUrls: fonts.map(name => `/fonts/${name}`) });
  let id = 0;
  const encode = text => new TextEncoder().encode(text);
  const compile = (main, sources, files = []) => new Promise(resolve => {
    const mine = ++id, t0 = performance.now();
    pending.set(mine, answer => resolve({ ...answer, wallMs: Math.round(performance.now() - t0) }));
    worker.postMessage({ type: 'compile', id: mine, job: { main, sources, files } });
  });
  const pdfjs = await import(pdfModule);
  pdfjs.GlobalWorkerOptions.workerSrc = '/js/pdf.worker.js';
  const textOf = async bytes => {
    const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) pages.push((await (await doc.getPage(n)).getTextContent()).items.map(item => item.str).join(' '));
    return { pages: doc.numPages, text: pages.join(' ') };
  };
  const brief = async answer => ({
    failed: answer.failed, reason: answer.reason, workerError: answer.workerError, ms: answer.ms, wallMs: answer.wallMs, pdfBytes: answer.pdf?.length ?? null,
    diagnostics: answer.diagnostics, pdfjs: answer.pdf ? await textOf(answer.pdf) : null,
  });
  const files = [{ path: 'references.bib', bytes: encode(bib) }];
  const out = {};
  out.fixtureCold = await brief(await compile('paper.typ', [{ path: 'paper.typ', text: fixture }], files));
  out.fixtureWarm = await brief(await compile('paper.typ', [{ path: 'paper.typ', text: fixture }], files));
  out.fixtureWarmAgain = await brief(await compile('paper.typ', [{ path: 'paper.typ', text: fixture }], files));
  out.fixtureEdited = await brief(await compile('paper.typ', [{ path: 'paper.typ', text: fixture.replace('Beta birds sing', 'Beta birds often sing') }], files));
  out.proposalsFixture = await brief(await compile('paper.typ', [{ path: 'paper.typ', text: proposals }]));
  out.wrappers = await brief(await compile('d.typ', [{ path: 'd.typ', text: wrapped }]));
  out.unclosedMath = await brief(await compile('b.typ', [{ path: 'b.typ', text: 'line one\n$ x' }]));
  out.missingFont = await brief(await compile('f.typ', [{ path: 'f.typ', text: '#set text(font: "Nonexistent Sans")\nhello' }]));
  out.sysVersion = await brief(await compile('v.typ', [{ path: 'v.typ', text: '#sys.version' }]));
  out.packageImport = await brief(await compile('p.typ', [{ path: 'p.typ', text: '#import "@preview/example:0.1.0"' }]));
  out.afterPackageFailure = await brief(await compile('paper.typ', [{ path: 'paper.typ', text: fixture }], files));
  out.missingBib = await brief(await compile('paper.typ', [{ path: 'paper.typ', text: fixture }]));
  return out;
}, { fonts: FONTS, fixture, bib, proposals, wrapped, pdfModule: '/pdf.mjs' });
await browser.close();

for (const [name, entry] of Object.entries(report)) console.log(name, JSON.stringify({ ...entry, pdfjs: entry.pdfjs ? { pages: entry.pdfjs.pages, text: entry.pdfjs.text.slice(0, 600) } : null }));
console.log('aborted requests', aborted.length, aborted.join(' '));

const has = (entry, ...parts) => parts.every(part => entry.pdfjs?.text.includes(part));
const checks = {
  'compile works, citations and APA reference list read by pdf.js': has(report.fixtureCold, 'Moss & Fern, 2020', 'Reed, 2018', 'Shade patterns in invented gardens', 'Willow Press'),
  'unclosed $ gives an error diagnostic with a line': report.unclosedMath.pdfBytes === null && report.unclosedMath.diagnostics?.some(d => d.severity === 'error' && d.line === 2),
  'unknown font family arrives as a warning': report.missingFont.diagnostics?.some(d => d.severity === 'warning' && /unknown font family/.test(d.message)),
  '#sys.version is a Typst 0.14 or 0.15 release': /^\s*0\.1[45]\.\d+\s*$/.test(report.sysVersion.pdfjs?.text ?? ''),
  'a package import fails and nothing left gloss.invalid': report.packageImport.pdfBytes === null && aborted.length === 0,
  'the compiler still works after the package failure': has(report.afterPackageFailure, 'Moss & Fern, 2020'),
  'the wrapper constructs compile': has(report.wrappers, 'old', 'new', 'extra'),
};
let failed = 0;
for (const [name, ok] of Object.entries(checks)) { console.log(ok ? 'PASS' : 'FAIL', name); if (!ok) failed++; }
process.exitCode = failed ? 1 : 0;
