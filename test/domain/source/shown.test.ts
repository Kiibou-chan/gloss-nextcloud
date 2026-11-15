import { expect, it } from 'vitest';
import golden from '../../fixtures/spike/shown.json';
import { parseTypst } from '../../../src/domain/source/typst-parse';
import { shown } from '../../../src/domain/source/shown';

it.each(golden.cases)('agrees with the spike for range $input.from:$input.to', ({ input, expected }) => {
  expect(shown(input.text, parseTypst(input.text), input.from, input.to)).toBe(expected);
});
it('reuses the index for late ranges, including hidden and empty ranges', () => {
  const text = '*alpha* _beta_\n\n'.repeat(10000);
  const ops = parseTypst(text);
  for (let i = 9900; i < 10000; i++) {
    const from = i * 16;
    expect(shown(text, ops, from, from + 16)).toBe('alpha beta');
  }
  expect(shown(text, ops, 0, 1)).toBe('');
  expect(shown(text, ops, 3, 3)).toBe('');
});
