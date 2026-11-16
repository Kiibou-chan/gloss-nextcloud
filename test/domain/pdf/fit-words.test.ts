import { expect, it } from 'vitest';
import { fitWords } from '../../../src/domain/pdf/fit-words';

const measure = (text: string, size: number) => text.length * size;

it('puts words that fit into one slot', () => {
  expect(fitWords('new words', [{ width: 100, size: 2 }], measure)).toEqual({ lines: ['new words'], overflow: '' });
});
it('spreads words over slots, each measured at its own size', () => {
  const calls: number[] = [];
  const spy = (text: string, size: number) => (calls.push(size), measure(text, size));
  const r = fitWords('aaa bbb ccc ddd', [{ width: 14, size: 2 }, { width: 24, size: 3 }], spy);
  expect(r).toEqual({ lines: ['aaa bbb', 'ccc ddd'], overflow: '' });
  expect(new Set(calls)).toEqual(new Set([2, 3]));
});
it('sends a word wider than every slot, and what follows it, to the overflow', () => {
  expect(fitWords('ab enormous cd', [{ width: 6, size: 1 }, { width: 7, size: 1 }], measure))
    .toEqual({ lines: ['ab', ''], overflow: 'enormous cd' });
});
it('skips a slot too narrow for the next word and uses a later one', () => {
  expect(fitWords('wide', [{ width: 2, size: 1 }, { width: 9, size: 1 }], measure))
    .toEqual({ lines: ['', 'wide'], overflow: '' });
});
it('puts everything into the overflow without slots', () => {
  expect(fitWords('inserted text', [], measure)).toEqual({ lines: [], overflow: 'inserted text' });
});
it('collapses whitespace', () => {
  expect(fitWords('  a \n\t b  ', [{ width: 100, size: 1 }], measure)).toEqual({ lines: ['a b'], overflow: '' });
  expect(fitWords('   ', [{ width: 100, size: 1 }], measure)).toEqual({ lines: [''], overflow: '' });
});
it('never measures below a slot size', () => {
  const sizes: number[] = [];
  fitWords('a b c d e f', [{ width: 3, size: 7 }, { width: 3, size: 5 }], (t, s) => (sizes.push(s), measure(t, s)));
  expect(Math.min(...sizes)).toBe(5);
});
