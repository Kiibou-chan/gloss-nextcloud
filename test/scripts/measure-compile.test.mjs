// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { formatReport, liftCutoff, parseArgs, reviewJson, summarise } from '../../scripts/measure-compile.mjs';
import { longDraft } from '../../scripts/make-long-draft.mjs';

describe('parseArgs', () => {
  it('defaults to five recompiles, 2,000 proposals, and no output file', () => {
    expect(parseArgs([])).toEqual({ runs: 5, proposals: 2000, lines: 10000, out: null });
  });

  it('reads --lines', () => {
    expect(parseArgs(['--lines', '2000']).lines).toBe(2000);
  });

  it('reads --runs, --proposals, and --out', () => {
    expect(parseArgs(['--runs', '3', '--proposals', '50', '--out', 'x.txt'])).toEqual({ runs: 3, proposals: 50, lines: 10000, out: 'x.txt' });
  });

  it('refuses an unknown flag and a count that is not a positive whole number', () => {
    expect(() => parseArgs(['--fast'])).toThrow('Unknown argument --fast');
    expect(() => parseArgs(['--runs', '0'])).toThrow('--runs needs a positive whole number');
    expect(() => parseArgs(['--proposals', 'many'])).toThrow('--proposals needs a positive whole number');
    expect(() => parseArgs(['--out'])).toThrow('--out needs a value');
  });
});

describe('liftCutoff', () => {
  const source = 'export const MAX_DRAFT_LINES = 2000\nexport const MAX_PROPOSALS = 400\nexport function tooLargeToCompile() {}\n';

  it('raises both limits in the limits module source and leaves the rest', () => {
    const lifted = liftCutoff(source);
    expect(lifted).toContain('export const MAX_DRAFT_LINES = 1000000');
    expect(lifted).toContain('export const MAX_PROPOSALS = 1000000');
    expect(lifted).toContain('export function tooLargeToCompile() {}');
  });

  it('refuses a source whose limits it cannot find', () => {
    expect(() => liftCutoff('export const X = 1')).toThrow('limits');
  });
});

describe('longDraft', () => {
  it('has the requested number of lines, 10,000 by default', () => {
    expect(longDraft().split('\n').length - 1).toBe(10000);
    expect(longDraft(2000).split('\n').length - 1).toBe(2000);
  });
});

describe('summarise', () => {
  it('gives the best and the median, averaging the middle pair of an even count', () => {
    expect(summarise([30, 10, 20])).toEqual({ best: 10, median: 20 });
    expect(summarise([40, 10, 30, 20])).toEqual({ best: 10, median: 25 });
  });
});

describe('reviewJson', () => {
  const text = Array.from({ length: 100 }, (_, i) => `line${i} alpha beta`).join('\n') + '\n';

  it('writes a format-1 review with the requested proposals spread evenly over the draft', () => {
    const review = reviewJson(text, 10, 'long.typ');
    expect(review.format).toBe(1);
    expect(review.draft.file).toBe('long.typ');
    expect(review.items).toHaveLength(10);
    const froms = review.items.map(item => item.from);
    expect(froms).toEqual([...froms].sort((a, b) => a - b));
    expect(froms[9] - froms[0]).toBeGreaterThan(text.length * 0.7);
    expect(new Set(review.items.map(item => item.id)).size).toBe(10);
  });

  it('quotes the draft exactly at each position', () => {
    for (const item of reviewJson(text, 10, 'long.typ').items) {
      expect(item.kind).toBe('proposal');
      expect(text.slice(item.from, item.from + item.quote.exact.length)).toBe(item.quote.exact);
      expect(text.slice(item.from - item.quote.prefix.length, item.from)).toBe(item.quote.prefix);
      expect(item.proposal).not.toBe(item.quote.exact);
    }
  });
});

describe('formatReport', () => {
  const result = {
    lines: 10000, proposals: 2000,
    changes: { first: 4200.4, recompiles: [910, 900.5, 920, 905, 930], worker: [310, 300.5, 320, 305, 330] },
    new: { first: 2100, recompiles: [800, 810, 790, 805, 795], worker: [200, 210, 190, 205, 195] },
  };

  it('names the size, then for each look the first compile, the recompiles, and the worker times, with best and median', () => {
    expect(formatReport(result).split('\n')).toEqual([
      'Compile timing at 10,000 lines and 2,000 proposals (wasm worker in Chromium)',
      'Changes: first compile 4200.4 ms from click to answer (download and fonts included)',
      'Changes: recompiles 910.0, 900.5, 920.0, 905.0, 930.0 ms from edit to answer (600 ms debounce included)',
      'Changes: recompiles best 900.5 ms, median 910.0 ms',
      'Changes: worker compile 310.0, 300.5, 320.0, 305.0, 330.0 ms',
      'Changes: worker best 300.5 ms, median 310.0 ms',
      'New text: first compile 2100.0 ms from click to answer (fonts already loaded)',
      'New text: recompiles 800.0, 810.0, 790.0, 805.0, 795.0 ms from edit to answer (600 ms debounce included)',
      'New text: recompiles best 790.0 ms, median 800.0 ms',
      'New text: worker compile 200.0, 210.0, 190.0, 205.0, 195.0 ms',
      'New text: worker best 190.0 ms, median 200.0 ms',
    ]);
  });
});
