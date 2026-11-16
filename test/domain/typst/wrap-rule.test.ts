import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { parseTypst } from '../../../src/domain/source/typst-parse'
import { wrappable } from '../../../src/domain/typst/wrap-rule'

const fixture = readFileSync('test/fixtures/nc/Typst/paper.typ', 'utf8')
const ok = (draft: string, old: string, words: string, nth = 0): boolean => {
  let from = -1
  for (let n = 0; n <= nth; n++) from = draft.indexOf(old, from + 1)
  expect(from).toBeGreaterThanOrEqual(0)
  return wrappable(draft, parseTypst(draft), from, from + old.length, words)
}
const at = (draft: string, marker: string, words: string, after = false): boolean => {
  const point = draft.indexOf(marker) + (after ? marker.length : 0)
  return wrappable(draft, parseTypst(draft), point, point, words)
}

test('text in a paragraph, a heading, a footnote, and across a soft line break is wrappable', () => {
  expect(ok(fixture, 'grow', 'thrive')).toBe(true)
  expect(ok(fixture, 'Synthetic', 'Invented')).toBe(true)
  expect(ok(fixture, 'Delta stones', 'Kappa stones')).toBe(true)
  expect(ok(fixture, 'gather\naround', 'meet around')).toBe(true)
  expect(ok(fixture, 'Zeta leaves', 'Mu leaves')).toBe(true)
})

test('maths, an argument, a reference, and statements are not', () => {
  expect(ok(fixture, 'a^2', 'a^3')).toBe(false)
  expect(ok(fixture, 'iota moss', 'kappa moss')).toBe(false)
  expect(ok(fixture, 'moss2020', 'moss2021')).toBe(false)
  expect(ok(fixture, 'size: 11pt', 'size: 12pt')).toBe(false)
})

test.each(['$', '[x', 'x]', '#x', '`x', '*x', '_x', '<x', 'x>', '@x', 'a // b', 'a /* b', 'a \\ b', 'a\n\nb'])('new words %j are refused', words => {
  expect(ok(fixture, 'grow', words)).toBe(false)
})

test('a blank line in the old range refuses', () => {
  expect(ok(fixture, 'dusk.\n\nGamma', 'dusk. Gamma')).toBe(false)
})

test.each(['- dash words', '+ plus', '= head', '/ Term:', '1. first', '  - indented', '12. twelve'])('words %j that begin a block are refused', words => {
  expect(ok(fixture, 'grow', words)).toBe(false)
  expect(ok(fixture, 'grow', 'a\n' + words)).toBe(false)
})

test('a marker after a line break is refused with or without indentation', () => {
  expect(ok(fixture, 'grow', 'a\n- b')).toBe(false)
  expect(ok(fixture, 'grow', 'a\n   3. b')).toBe(false)
  expect(ok(fixture, 'grow', 'a\n= b')).toBe(false)
})

test('old words that begin a block are refused, a dash inside a line is not', () => {
  const draft = 'We wait 3 - 5 days and 12. then go.\n'
  expect(ok(draft, '- 5', '5')).toBe(false)
  expect(ok(draft, ' 5', ' 6')).toBe(true)
  expect(ok(draft, '3 - 5 days', 'a week')).toBe(true)
  expect(ok(draft, '12. then', 'later')).toBe(false)
  expect(ok(draft, 'and 12.', 'and 13.')).toBe(true)
  expect(ok(draft, '3 - 5', '3 - 6')).toBe(true)
  expect(ok(draft, '5', '5-6')).toBe(true)
})

test('an insertion is judged by the characters on either side', () => {
  expect(at(fixture, 'grow', 'will ')).toBe(true)
  expect(at(fixture, 'dusk.', ' Late.', true)).toBe(true)
  expect(at(fixture, 'dusk.', 'x', true)).toBe(true)
  expect(wrappable('abc', parseTypst('abc'), 3, 3, ' def')).toBe(true)
  expect(wrappable('abc', parseTypst('abc'), 0, 0, 'def ')).toBe(true)
  expect(wrappable('x $y$ z', parseTypst('x $y$ z'), 3, 3, 'q')).toBe(false)
  expect(wrappable('x $y$ z', parseTypst('x $y$ z'), 5, 5, 'q')).toBe(false)
  expect(wrappable('x\\#y', parseTypst('x\\#y'), 2, 2, 'q')).toBe(false)
})

test('a replacement that starts straight after a backslash is refused', () => {
  const draft = 'a \\# b'
  expect(wrappable(draft, parseTypst(draft), 3, 4, 'x')).toBe(false)
})

test('no line break inside a heading or a list item', () => {
  expect(ok(fixture, 'Synthetic', 'a\nb')).toBe(false)
  expect(ok(fixture, 'Zeta leaves', 'a\nb')).toBe(false)
  expect(ok(fixture, 'grow', 'a\nb')).toBe(true)
})
