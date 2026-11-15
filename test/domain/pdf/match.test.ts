import { expect, it } from 'vitest';
import golden from '../../fixtures/spike/pdf.json';
import { parseTypst, plainOps } from '../../../src/domain/source/typst-parse';
import type { PdfPlacement } from '../../../src/domain/pdf/match';
import { keyOf, sourceKey, pdfKey, toSource, placeMarks } from '../../../src/domain/pdf/match';

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
