import { expect, it } from 'vitest';
import { parseTypst, plainOps } from '../../../src/domain/source/typst-parse';
import { pdfKey, sourceKey } from '../../../src/domain/pdf/match';
import type { PdfCaret } from '../../../src/domain/pdf/proposal-marks';
import { placeItem } from '../../../src/domain/pdf/proposal-marks';

type Item = { from: number; to: number; inserts: boolean };
const place = (text: string, pages: string[][], item: Item, fraction = 0.5) =>
  placeItem(sourceKey('draft.txt', text, plainOps(text)), pdfKey(pages), { id: 'a', ...item }, fraction);
const caret = (item: number, offset: number, edge: PdfCaret['edge']): PdfCaret => ({ id: 'a', page: 1, item, offset, edge });
const seg = (page: number, startItem: number, startOffset: number, endItem: number, endOffset: number) =>
  ({ id: 'a', page, startItem, startOffset, endItem, endOffset });

it('strikes a deletion and draws no caret', () => {
  expect(place('alpha beta gamma delta', [['alpha beta gamma delta']], { from: 6, to: 10, inserts: false })).toEqual({
    struck: [seg(1, 0, 6, 0, 10)], caret: null, rung: 'both',
  });
});
it('puts the caret after the last struck character of a replacement', () => {
  expect(place('alpha beta gamma delta', [['alpha beta gamma delta']], { from: 6, to: 10, inserts: true })).toEqual({
    struck: [seg(1, 0, 6, 0, 10)],
    caret: caret(0, 9, 'after'),
    rung: 'both',
  });
});
it('puts the caret of an insertion after the word before it', () => {
  expect(place('alpha beta gamma delta', [['alpha beta gamma delta']], { from: 10, to: 10, inserts: true })).toEqual({
    struck: [], caret: { id: 'a', page: 1, item: 0, offset: 9, edge: 'after' }, rung: 'both',
  });
});
it('puts the caret of an insertion at the very start before the first character', () => {
  expect(place('alpha beta', [['alpha beta']], { from: 0, to: 0, inserts: true })).toEqual({
    struck: [], caret: { id: 'a', page: 1, item: 0, offset: 0, edge: 'before' }, rung: 'both',
  });
});
it('gives a caret and no struck segment for punctuation replaced by punctuation', () => {
  expect(place('alpha, beta', [['alpha, beta']], { from: 5, to: 6, inserts: true })).toEqual({
    struck: [], caret: { id: 'a', page: 1, item: 0, offset: 4, edge: 'after' }, rung: 'both',
  });
});
it('gives a caret for a whitespace-only proposal', () => {
  expect(place('alpha beta', [['alpha beta']], { from: 5, to: 6, inserts: true })?.caret)
    .toEqual({ id: 'a', page: 1, item: 0, offset: 4, edge: 'after' });
});
it('strikes a span across a paragraph break over two text items', () => {
  expect(place('alpha beta\n\ngamma delta', [['alpha beta', 'gamma delta']], { from: 6, to: 17, inserts: false })?.struck)
    .toEqual([seg(1, 0, 6, 1, 5)]);
});
it('places a heading by the words after it when the PDF prints a section number before it', () => {
  const text = 'alpha beta\n\n= Observations\nzeta eta';
  const at = text.indexOf('Observations');
  expect(place(text, [['alpha beta', '2', 'Observations', 'zeta eta']], { from: at, to: at + 12, inserts: false })).toEqual({
    struck: [seg(1, 2, 0, 2, 12)], caret: null, rung: 'after',
  });
});
it('places a word by the words before it when the PDF has a number after it', () => {
  expect(place('alpha beta gamma', [['alpha beta 7 gamma']], { from: 6, to: 10, inserts: false })).toEqual({
    struck: [seg(1, 0, 6, 0, 10)], caret: null, rung: 'before',
  });
});
it('places a word alone when both contexts are broken on the PDF', () => {
  expect(place('alpha beta gamma', [['alpha 1 beta 2 gamma']], { from: 6, to: 10, inserts: false })).toEqual({
    struck: [seg(1, 0, 8, 0, 12)], caret: null, rung: 'alone',
  });
});
it('splits a cross-page span on clean pages into two segments', () => {
  expect(place('alpha beta gamma', [['alpha be'], ['ta gamma']], { from: 6, to: 10, inserts: false })?.struck)
    .toEqual([seg(1, 0, 6, 0, 8), seg(2, 0, 0, 0, 2)]);
});
it('returns null for a cross-page span with a page number between the pages', () => {
  expect(place('alpha beta gamma', [['alpha be', '7'], ['ta gamma']], { from: 6, to: 10, inserts: false })).toBeNull();
});
it('prefers the occurrence its context names over a nearer wrong one', () => {
  const text = 'red beta blue green beta yellow';
  const second = text.lastIndexOf('beta');
  const placed = place(text, [['red beta blue', 'green beta yellow']], { from: second, to: second + 4, inserts: false }, 0.1);
  expect(placed?.struck).toEqual([seg(1, 1, 6, 1, 10)]);
  expect(placed?.rung).toBe('both');
});
it('returns null for an insertion whose context is not on the PDF', () => {
  expect(place('alpha beta', [['zeta eta']], { from: 5, to: 5, inserts: true })).toBeNull();
});
it('counts both units of an astral letter and splits a ligature across items', () => {
  expect(place('alpha \u{10428}eta gamma', [['alpha \u{10428}eta gamma']], { from: 6, to: 11, inserts: false })?.struck)
    .toEqual([seg(1, 0, 6, 0, 11)]);
  expect(place('alpha finite', [['Alpha ﬁ', 'nite']], { from: 6, to: 12, inserts: true })).toEqual({
    struck: [seg(1, 0, 6, 1, 4)],
    caret: { id: 'a', page: 1, item: 1, offset: 3, edge: 'after' },
    rung: 'both',
  });
});

const typstPlace = (text: string, pdf: string[], item: Item) =>
  placeItem(sourceKey('draft.typ', text, parseTypst(text)), pdfKey([pdf]), { id: 'a', ...item }, 0.5);
const commented = 'Alpha beta gamma.\n\n// Theta notes stay here.\n';
const theta = commented.indexOf('Theta');
it('does not place a replacement whose words sit in a Typst comment', () => {
  expect(typstPlace(commented, ['Alpha beta gamma.'], { from: theta, to: theta + 5, inserts: true })).toBeNull();
});
it('does not place a deletion of a word inside a Typst comment', () => {
  expect(typstPlace(commented, ['Alpha beta gamma.'], { from: theta, to: theta + 5, inserts: false })).toBeNull();
});
it('still places a whitespace-only range and a plain insertion in a Typst source', () => {
  const text = 'Alpha beta gamma.\n';
  expect(typstPlace(text, ['Alpha beta gamma.'], { from: 5, to: 6, inserts: true })?.caret).toEqual({ id: 'a', page: 1, item: 0, offset: 4, edge: 'after' });
  expect(typstPlace(text, ['Alpha beta gamma.'], { from: 10, to: 10, inserts: true })?.caret).toEqual({ id: 'a', page: 1, item: 0, offset: 9, edge: 'after' });
});
