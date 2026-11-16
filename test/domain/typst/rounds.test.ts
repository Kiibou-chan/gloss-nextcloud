import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { DraftReview } from '../../../src/domain/review/draft-review'
import { parseTypst } from '../../../src/domain/source/typst-parse'
import type { Diagnostic } from '../../../src/domain/typst/diagnostic'
import { diffSource } from '../../../src/domain/typst/generated'
import type { Generated, Shape } from '../../../src/domain/typst/generated'
import { nextShape } from '../../../src/domain/typst/rounds'

const draft = readFileSync('test/fixtures/nc/Typst/paper.typ', 'utf8')
const ops = parseTypst(draft)
const none: Shape = { unwrap: new Set(), omit: new Set() }
const at = (t: string): number => draft.indexOf(t)
const review = new DraftReview('paper.typ', draft)
review.edit([{ from: at('grow'), to: at('grow') + 4, insert: 'thrive' }, { from: at('Gamma'), to: at('Gamma') + 5, insert: 'Kappa' },
  { from: at('a^2'), to: at('a^2') + 3, insert: 'a^3' }], (() => { let n = 0; return () => 'p' + ++n })(), 'x')
const [grow, gamma, maths] = review.items().map(i => i.id) as [string, string, string]
const first = diffSource(review, draft, ops, none)
const lineOf = (g: Generated, text: string): number => g.text.slice(0, g.text.indexOf(text)).split('\n').length
const error = (line: number | null, message = 'unclosed delimiter'): Diagnostic => ({ severity: 'error', message, line })

test('the fixture has two wrapped proposals and one unmarked', () => {
  expect(first.wrapped).toEqual(new Set([grow, gamma]))
  expect(first.unmarked).toEqual(new Set([maths]))
})

test('an error on a wrapped proposal line unwraps it alone', () => {
  expect(nextShape(first, none, [error(lineOf(first, 'gloss-review-ins[thrive]'))])).toEqual({ unwrap: new Set([grow]), omit: new Set() })
})

test('an error on an unwrapped proposal line omits it alone', () => {
  const g = diffSource(review, draft, ops, { unwrap: new Set([grow]), omit: new Set() })
  expect(nextShape(g, { unwrap: new Set([grow]), omit: new Set() }, [error(lineOf(g, 'a^3'))])).toEqual({ unwrap: new Set([grow]), omit: new Set([maths]) })
})

test('an error with no line unwraps all, then omits all unwrapped ones, then answers the draft', () => {
  const a = nextShape(first, none, [error(null)]) as Shape
  expect(a).toEqual({ unwrap: new Set([grow, gamma]), omit: new Set() })
  const b = nextShape(diffSource(review, draft, ops, a), a, [error(null)]) as Shape
  expect(b).toEqual({ unwrap: new Set([grow, gamma]), omit: new Set([grow, gamma, maths]) })
  expect(nextShape(diffSource(review, draft, ops, b), b, [error(null)])).toBe('draft')
})

test('an error on a line of the draft itself names no proposal and so counts as no line', () => {
  expect(nextShape(first, none, [error(lineOf(first, 'Epsilon seeds'))])).toEqual({ unwrap: new Set([grow, gamma]), omit: new Set() })
})

test('a warning alone leaves the shape', () => {
  expect(nextShape(first, none, [{ severity: 'warning', message: 'unknown font family: x', line: 1 }])).toBe(none)
})

test.each(['file not found (searched at /refs.bib)', 'failed to load file (access denied)'])('%s ends the rounds as a file error whatever its line', message => {
  expect(nextShape(first, none, [error(lineOf(first, 'gloss-review-ins[thrive]'), message)])).toBe('file')
  expect(nextShape(first, none, [error(null, message)])).toBe('file')
})
