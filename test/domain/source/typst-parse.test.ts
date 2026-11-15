import { describe, expect, it } from 'vitest';
import golden from '../../fixtures/spike/typst.json';
import { parseTypst, plainOps } from '../../../src/domain/source/typst-parse';

describe('Typst parsing', () => {
  it.each(golden.cases)('preserves the spike ops for $input.text', ({ input, expected }) => {
    expect(parseTypst(input.text)).toEqual(expected);
  });
  it('wraps plain text without hiding markup', () => {
    expect(plainOps('*alpha*')).toEqual([
      { op: 'open', tag: 'div', cls: 'gr-plain' },
      { op: 'text', from: 0, to: 7 }, { op: 'close' },
    ]);
    expect(plainOps('')[1]).toEqual({ op: 'text', from: 0, to: 0 });
  });
});
