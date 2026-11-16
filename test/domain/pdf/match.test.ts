import { expect, it } from 'vitest';
import golden from '../../fixtures/spike/pdf.json';
import { parseTypst, plainOps } from '../../../src/domain/source/typst-parse';
import type { PdfPlacement } from '../../../src/domain/pdf/match';
import { keyOf, sourceKey, pdfKey, toSource, placeMarks, nearestKey, segments } from '../../../src/domain/pdf/match';

it.each(golden.cases)('matches the spike: $input.name', ({ input, expected }) => {
  const sk = sourceKey('draft.typ', input.text, parseTypst(input.text));
  expect(sk.key).toBe(expected.sourceKey.key);
  expect(sk.at).toEqual(expected.sourceKey.at);
  expect(keyOf([...input.selected].map(c => [c, 0] as const))).toEqual(expected.selectionKey);
  expect(toSource(sk, input.selected, input.fraction)).toEqual(
    expected.toSource === null ? null : { file: 'draft.typ', ...expected.toSource },
  );
});
it('returns null for missing and empty selections', () => {
  const sk = sourceKey('draft.txt', 'alpha', plainOps('alpha'));
  expect(toSource(sk, 'absent', 0.5)).toBeNull();
  expect(toSource(sk, ' - ', 0.5)).toBeNull();
});
it('places words across text items with ligature and hyphen offsets', () => {
  const pk = pdfKey([['Alpha ﬁ', 'nite hy-', 'phen.']]);
  expect(placeMarks(pk, [{ id: 'a', shown: 'finite hyphen', fraction: 0.5 }])).toEqual([
    { id: 'a', page: 1, startItem: 0, startOffset: 6, endItem: 2, endOffset: 4 },
  ]);
});
it('chooses the nearer occurrence and keeps the first on a tie', () => {
  const pk = pdfKey([['alpha'], ['alpha']]);
  expect(placeMarks(pk, [{ id: 'near', shown: 'alpha', fraction: 0.9 }])[0]?.page).toBe(2);
  expect(placeMarks(pk, [{ id: 'tie', shown: 'alpha', fraction: 0.25 }])[0]?.page).toBe(1);
});
it('splits a cross-page match into page-local segments', () => {
  const pk = pdfKey([['alpha ', 'be'], [], ['ta gamma']]);
  expect(placeMarks(pk, [{ id: 'a', shown: 'beta', fraction: 0.5 }])).toEqual([
    { id: 'a', page: 1, startItem: 1, startOffset: 0, endItem: 1, endOffset: 2 },
    { id: 'a', page: 3, startItem: 0, startOffset: 0, endItem: 0, endOffset: 2 },
  ]);
});
it('omits unmatched and empty marks, including an empty PDF', () => {
  const items = [{ id: 'a', shown: 'absent', fraction: 0 }, { id: 'b', shown: '', fraction: 1 }];
  expect(placeMarks(pdfKey([['alpha']]), items)).toEqual([]);
  expect(placeMarks(pdfKey([]), items)).toEqual([]);
});
it('keeps UTF-16 offsets aligned for supplementary letters', () => {
  expect(keyOf([['𐐀', 9]])).toEqual({ key: '𐐨', at: [9, 9] });
  const text = 'a 𐐀 b';
  expect(toSource(sourceKey('draft.txt', text, plainOps(text)), '𐐨', 0.5)).toEqual({
    file: 'draft.txt', from: 2, to: 4,
  });
  expect(placeMarks(pdfKey([[text]]), [{ id: 'a', shown: '𐐨', fraction: 0.5 }])).toEqual([
    { id: 'a', page: 1, startItem: 0, startOffset: 2, endItem: 0, endOffset: 4 },
  ] satisfies PdfPlacement[]);
});
it('searches a ready key and splits a key range into page-local segments', () => {
  expect(nearestKey('alphabetaalpha', 'alpha', 0.9)).toEqual({ start: 9, end: 14 });
  expect(nearestKey('alphabeta', 'gamma', 0.5)).toBeNull();
  expect(nearestKey('alpha', '', 0.5)).toBeNull();
  const pk = pdfKey([['alpha be'], ['ta']]);
  expect(segments(pk, 'x', 5, 9)).toEqual([
    { id: 'x', page: 1, startItem: 0, startOffset: 6, endItem: 0, endOffset: 8 },
    { id: 'x', page: 2, startItem: 0, startOffset: 0, endItem: 0, endOffset: 2 },
  ]);
});

function oracleNearest(key: string, needle: string, fraction: number): { start: number; end: number } | null {
  if (!needle) return null;
  let best = -1;
  for (let hit = key.indexOf(needle); hit >= 0; hit = key.indexOf(needle, hit + 1)) {
    if (best < 0 || Math.abs(hit / key.length - fraction) < Math.abs(best / key.length - fraction)) best = hit;
  }
  return best < 0 ? null : { start: best, end: best + needle.length };
}
function seeded(seed: number): (n: number) => number {
  let s = seed;
  return n => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s % n; };
}
function keyWith(length: number, needle: string, starts: number[]): string {
  const chars = Array.from({ length }, () => 'z');
  for (const at of starts) for (let i = 0; i < needle.length; i++) chars[at + i] = needle[i]!;
  return chars.join('');
}

it('equals the whole-key search over 2,000 seeded needles and fractions on a long key', () => {
  const random = seeded(0x4a3);
  const words = ['alpha', 'beta', 'gamma', 'delta', 'eps', 'zeta'];
  let key = '';
  while (key.length < 120000) key += words[random(words.length)]! + String(random(40));
  for (let i = 0; i < 2000; i++) {
    const from = random(key.length - 40);
    const needle = key.slice(from, from + 1 + random(30));
    const fraction = random(1000) / 1000 + (i % 7 === 0 ? 0.0005 : 0);
    expect(nearestKey(key, needle, fraction)).toEqual(oracleNearest(key, needle, fraction));
  }
  expect(nearestKey(key, 'absent!', 0.5)).toBeNull();
});
it('equals the whole-key search on constructed ties and window edges', () => {
  const needle = 'abc';
  const length = 20000;
  const centre = 10000;
  const fraction = centre / length;
  const cases: number[][] = [
    [centre - 100, centre + 100],
    [centre + 100, centre - 100],
    [centre - 1999, centre + 1999],
    [centre - 2000, centre + 2000],
    [centre - 2001, centre + 2001],
    [centre + 2000 + needle.length - 1],
    [centre + 2000 + needle.length],
    [centre + 1999, centre + 2000 + needle.length - 1],
    [centre - 2000, centre + 2000 + needle.length - 1],
    [centre - 2000],
    [centre - 2001],
    [centre + 1990, centre - 2005],
  ];
  for (const starts of cases) {
    const key = keyWith(length, needle, starts);
    expect(nearestKey(key, needle, fraction), starts.join()).toEqual(oracleNearest(key, needle, fraction));
  }
  for (let hit = centre - 2100; hit <= centre + 2100; hit++) {
    const key = keyWith(length, needle, [hit, 50]);
    expect(nearestKey(key, needle, fraction), String(hit)).toEqual(oracleNearest(key, needle, fraction));
  }
  const random = seeded(0x77);
  for (let i = 0; i < 300; i++) {
    const a = centre + random(4200) - 2100;
    const b = centre + random(4200) - 2100;
    const key = keyWith(length, needle, [Math.min(a, b), Math.max(a, b) + needle.length]);
    const f = (centre + random(5) - 2) / length;
    expect(nearestKey(key, needle, f)).toEqual(oracleNearest(key, needle, f));
  }
});
