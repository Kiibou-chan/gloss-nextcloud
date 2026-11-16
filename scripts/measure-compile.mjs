// Times the in-browser Typst compile on the 10,000-line draft with 2,000 proposals, under a route-mocked page.
// Usage: node scripts/measure-compile.mjs [--runs 5] [--proposals 2000] [--out report.txt]  (run under xvfb-run or headless)
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { longDraft } from './make-long-draft.mjs';
import { syntheticRoutes } from './shots/synthetic.mjs';

const NOW = '2026-11-16T10:00:00.000Z';
const LINK = 'http://gloss.invalid/index.php/apps/gloss/r/synthetic#measure00000key1';

function count(flag, value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${flag} needs a positive whole number`);
  return n;
}

export function parseArgs(argv) {
  const options = { runs: 5, proposals: 2000, out: null };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--runs') options.runs = count(flag, argv[++i]);
    else if (flag === '--proposals') options.proposals = count(flag, argv[++i]);
    else if (flag === '--out') {
      if (argv[i + 1] === undefined) throw new Error('--out needs a value');
      options.out = argv[++i];
    } else throw new Error(`Unknown argument ${flag}`);
  }
  return options;
}

export function summarise(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = sorted.length / 2;
  return { best: sorted[0], median: sorted.length % 2 ? sorted[Math.floor(middle)] : (sorted[middle - 1] + sorted[middle]) / 2 };
}

/** A format-1 review of `count` replacement proposals on words spread evenly over `text`. */
export function reviewJson(text, count, file) {
  const words = [...text.matchAll(/\S+/g)];
  const step = Math.max(1, Math.floor(words.length / count));
  const items = Array.from({ length: count }, (_, i) => {
    const word = words[Math.min(words.length - 1, i * step)];
    const from = word.index;
    return {
      id: `p${String(i).padStart(9, '0')}`, kind: 'proposal', file, from,
      quote: { exact: word[0], prefix: text.slice(Math.max(0, from - 32), from), suffix: text.slice(from + word[0].length, from + word[0].length + 32) },
      proposal: word[0].toUpperCase(), comments: [], at: NOW,
    };
  });
  return { format: 1, revision: 1, name: 'Measure', draft: { file, etag: 'synthetic-v1' }, sent: false, sentAt: null, updatedAt: NOW, items };
}

const ms = value => value.toFixed(1);
const list = values => values.map(ms).join(', ');

export function formatReport({ lines, proposals, changes, new: fresh }) {
  const out = [`Compile timing at ${lines.toLocaleString('en-GB')} lines and ${proposals.toLocaleString('en-GB')} proposals (wasm worker in Chromium)`];
  for (const [label, look, note] of [['Changes', changes, 'download and fonts included'], ['New text', fresh, 'fonts already loaded']]) {
    const wall = summarise(look.recompiles), worker = summarise(look.worker);
    out.push(
      `${label}: first compile ${ms(look.first)} ms from click to answer (${note})`,
      `${label}: recompiles ${list(look.recompiles)} ms from edit to answer (600 ms debounce included)`,
      `${label}: recompiles best ${ms(wall.best)} ms, median ${ms(wall.median)} ms`,
      `${label}: worker compile ${list(look.worker)} ms`,
      `${label}: worker best ${ms(worker.best)} ms, median ${ms(worker.median)} ms`,
    );
  }
  return out.join('\n');
}

/** Wraps Worker so each compiler answer is stamped on `window.__answers` with the page clock. */
function watchAnswers(context) {
  return context.addInitScript(() => {
    const Original = window.Worker;
    window.__answers = [];
    window.Worker = class extends Original {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', event => {
          if (event.data && typeof event.data.ms === 'number') window.__answers.push({ ms: event.data.ms, at: performance.now(), pdf: !!event.data.pdf });
        });
      }
    };
  });
}

async function measure(options) {
  const { chromium } = await import('@playwright/test');
  const text = longDraft();
  const review = reviewJson(text, options.proposals, 'long.typ');
  const reviews = new Map();
  reviews.get = () => review;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ colorScheme: 'light', viewport: { width: 1600, height: 1000 } });
    await watchAnswers(context);
    await syntheticRoutes(context, 'typst-measure', reviews, 'Typst', { main: 'long.typ', text });
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);
    await page.goto(LINK, { waitUntil: 'networkidle' });
    await page.locator('.cm-content').waitFor();
    await page.locator('.gr-items > li').first().waitFor();
    const cards = await page.locator('.gr-items > li').count();
    if (cards !== options.proposals) throw new Error(`The page lists ${cards} cards, not ${options.proposals} proposals.`);
    const answers = () => page.evaluate(() => window.__answers.length);
    const clock = () => page.evaluate(() => performance.now());
    const answered = async before => {
      await page.waitForFunction(n => window.__answers.length > n, before, { timeout: 300_000, polling: 50 });
      const answer = await page.evaluate(n => window.__answers[n], before);
      if (!answer.pdf) throw new Error('The compiler answered without a PDF.');
      return answer;
    };
    const look = async (open, label) => {
      const before = await answers();
      const start = await clock();
      await open();
      const first = await answered(before);
      const result = { first: first.at - start, recompiles: [], worker: [] };
      for (let run = 0; run < options.runs; run++) {
        const seen = await answers();
        await page.getByRole('button', { name: 'Both', exact: true }).click();
        await page.locator('.cm-content').click();
        await page.keyboard.press('Control+Home');
        await page.keyboard.press('Control+Shift+ArrowRight');
        const at = await clock();
        await page.keyboard.insertText(`edit${label}${run}`);
        const next = await answered(seen);
        result.recompiles.push(next.at - at);
        result.worker.push(next.ms);
      }
      return result;
    };
    const press = name => () => page.getByRole('button', { name, exact: true }).click();
    const changes = await look(press('PDF'), 'c');
    const fresh = await look(press('New text'), 'n');
    return { lines: text.split('\n').length - 1, proposals: options.proposals, changes, new: fresh };
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parseArgs(process.argv.slice(2));
  const report = formatReport(await measure(options));
  console.log(report);
  if (options.out) await writeFile(options.out, `${report}\n`);
}
