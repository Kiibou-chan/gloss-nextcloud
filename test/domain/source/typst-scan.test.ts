import { expect, test } from 'vitest'
import { skipBalanced, skipComment, skipString, statementEnd } from '../../../src/domain/source/typst-scan'

test('skipString passes an escaped quote and answers the index past the closing quote', () => {
  const src = 'x "a\\"b" y'
  expect(skipString(src, 2)).toBe(8)
  expect(skipString('"open', 0)).toBe(5)
})

test('skipComment skips a line comment up to its newline and a block comment past its end', () => {
  expect(skipComment('a // b\nc', 2)).toBe(6)
  expect(skipComment('a /* b */ c', 2)).toBe(9)
  expect(skipComment('a /* open', 2)).toBe(9)
  expect(skipComment('a / b', 2)).toBe(2)
})

test('skipBalanced and statementEnd carry over strings', () => {
  expect(skipBalanced('f(")", 1) x', 1)).toBe(9)
  expect(skipBalanced('f(1', 1)).toBe(3)
  expect(statementEnd('#set x("a\nb")\nnext', 0)).toBe(13)
})
