import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { DraftReview } from '../../../src/domain/review/draft-review'
import type { Change } from '../../../src/domain/review/model'
import { parseTypst } from '../../../src/domain/source/typst-parse'
import { diffSource, fromDraft, newSource, toDraft } from '../../../src/domain/typst/generated'
import type { Shape } from '../../../src/domain/typst/generated'

const draft = readFileSync('test/fixtures/nc/Typst/paper.typ', 'utf8')
const ops = parseTypst(draft)
const none: Shape = { unwrap: new Set(), omit: new Set() }
const now = '2026-11-16T10:00:00Z'
const at = (text: string): number => { const i = draft.indexOf(text); expect(i).toBeGreaterThanOrEqual(0); return i }
function review(...edits: [string, string][]): DraftReview {
  const changes: Change[] = edits.map(([old, insert]) => ({ from: at(old), to: at(old) + old.length, insert }))
  const r = new DraftReview('paper.typ', draft)
  let n = 0
  r.edit(changes, () => 'p' + ++n, now)
  return r
}
const insertion = (marker: string, insert: string): Change => ({ from: at(marker) + marker.length, to: at(marker) + marker.length, insert })

test('DraftReview.rewrite with the proposal text is the applied text and passes the generated offset', () => {
  const r = review(['grow', 'thrive'], ['Gamma', 'Kappa'])
  expect(r.rewrite(p => p.proposal)).toBe(r.applied())
  const seen: number[] = []
  r.rewrite((p, offset) => { seen.push(offset); return p.proposal })
  expect(seen).toEqual([at('grow'), at('Gamma') + 2])
})

test('a replacement, a deletion, and an insertion in text are wrapped', () => {
  const r = new DraftReview('paper.typ', draft)
  r.edit([{ from: at('grow'), to: at('grow') + 4, insert: 'thrive' }, { from: at('Beta '), to: at('Beta ') + 5, insert: '' }, insertion('dusk.', ' Late.')], (() => { let n = 0; return () => 'p' + ++n })(), now)
  const g = diffSource(r, draft, ops, none)
  expect(g.text).toContain('Alpha trees #gloss-review-del[grow];#gloss-review-ins[thrive]; beside')
  expect(g.text).toContain('#gloss-review-del[Beta ];birds sing')
  expect(g.text).toContain('dusk.#gloss-review-ins[ Late.];\n')
  expect(g.wrapped.size).toBe(3)
  expect(g.unmarked.size).toBe(0)
})

test('a replacement across the soft line break and one in a heading are wrapped', () => {
  const g = diffSource(review(['gather\n', 'meet '], ['Synthetic', 'Invented']), draft, ops, none)
  expect(g.text).toContain('and #gloss-review-del[gather\n];#gloss-review-ins[meet ];around the fountain')
  expect(g.text).toContain('= #gloss-review-del[Synthetic];#gloss-review-ins[Invented]; orchard')
})

test('a proposal inside the footnote is wrapped', () => {
  const g = diffSource(review(['stones', 'rocks']), draft, ops, none)
  expect(g.text).toContain('#footnote[Delta #gloss-review-del[stones];#gloss-review-ins[rocks]; rest')
})

test('maths, an argument, new words with a dollar, and a span over a blank line are unmarked with their new words in place', () => {
  const r = review(['a^2', 'a^3'], ['iota moss', 'kappa moss'], ['grow', 'g$w'], ['dusk.\n\nGamma', 'dusk. Gamma'])
  const g = diffSource(r, draft, ops, none)
  expect(g.wrapped.size).toBe(0)
  expect(g.unmarked.size).toBe(4)
  expect(g.text).toContain('$ a^3 + b^2 = c^2 $')
  expect(g.text).toContain('[kappa moss covers')
  expect(g.text).toContain('Alpha trees g$w beside')
  expect(g.text).toContain('dusk. Gamma clouds')
})

test('shape.unwrap puts a wrapped proposal in place and shape.omit keeps its old words', () => {
  const r = review(['grow', 'thrive'], ['Gamma', 'Kappa'])
  const [a, b] = r.items().map(i => i.id)
  const g = diffSource(r, draft, ops, { unwrap: new Set([a!]), omit: new Set([b!]) })
  expect(g.text).toContain('Alpha trees thrive beside')
  expect(g.text).toContain('Gamma clouds')
  expect(g.unmarked).toEqual(new Set([a]))
  expect(g.omitted).toEqual(new Set([b]))
  expect(g.wrapped.size).toBe(0)
})

test('newSource marks new words, leaves deletions nothing, and shares the unmarked set', () => {
  const r = new DraftReview('paper.typ', draft)
  r.edit([{ from: at('grow'), to: at('grow') + 4, insert: 'thrive' }, { from: at('Beta '), to: at('Beta ') + 5, insert: '' }, { from: at('a^2'), to: at('a^2') + 3, insert: 'a^3' }], (() => { let n = 0; return () => 'p' + ++n })(), now)
  const g = newSource(r, draft, ops, none)
  expect(g.text).toContain('Alpha trees #gloss-review-new[thrive]; beside')
  expect(g.text).toContain('\nbirds sing')
  expect(g.text).not.toContain('gloss-review-del')
  expect(g.text).toContain('$ a^3 + b^2')
  expect(g.wrapped.size).toBe(1)
  expect(g.unmarked.size).toBe(1)
})

test('toDraft maps copied text, old words, new words to the proposal, and the prelude nowhere', () => {
  const r = review(['grow', 'thrive'])
  const g = diffSource(r, draft, ops, none)
  const copy = g.text.indexOf('beside the river')
  expect(toDraft(g, copy, copy + 6)).toEqual({ from: at('beside the river'), to: at('beside the river') + 6 })
  const old = g.text.indexOf('[grow]') + 1
  expect(toDraft(g, old + 1, old + 3)).toEqual({ from: at('grow') + 1, to: at('grow') + 3 })
  const added = g.text.indexOf('[thrive]') + 1
  expect(toDraft(g, added + 2, added + 4)).toEqual({ from: at('grow'), to: at('grow') + 4 })
  expect(toDraft(g, 0, 5)).toBeNull()
  expect(toDraft(g, g.text.indexOf('#gloss-review-ins') + 2, g.text.indexOf('#gloss-review-ins') + 6)).toBeNull()
})

test('toDraft of a range over a copy and an unwrapped proposal covers both', () => {
  const r = review(['a^2', 'a^3'])
  const g = diffSource(r, draft, ops, none)
  const from = g.text.indexOf('$ a^3')
  expect(toDraft(g, from + 2, from + 5)).toEqual({ from: at('a^2'), to: at('a^2') + 3 })
  expect(toDraft(g, from - 3, from + 5)).toEqual({ from: at('a^2') - 5, to: at('a^2') + 3 })
})

test('fromDraft past three proposals shifts by their length change', () => {
  const r = review(['grow', 'thrive'], ['Gamma', 'Kappa!'], ['Theta', 'Iota'])
  for (const g of [diffSource(r, draft, ops, none), newSource(r, draft, ops, none)]) {
    for (const probe of ['beside', 'Method', 'Results', 'bibliography(']) {
      const p = at(probe)
      expect(g.text.slice(fromDraft(g, p), fromDraft(g, p) + 4)).toBe(draft.slice(p, p + 4))
    }
    expect(fromDraft(g, draft.length)).toBe(g.text.length)
  }
})

test('fromDraft inside old words follows them in the diff and lands on the new words in the new text', () => {
  const r = review(['grow', 'thrive'])
  const g = diffSource(r, draft, ops, none)
  expect(g.text.slice(fromDraft(g, at('grow') + 1), fromDraft(g, at('grow') + 3))).toBe('ro')
  const n = newSource(r, draft, ops, none)
  expect(n.text.slice(fromDraft(n, at('grow') + 1), fromDraft(n, at('grow') + 1) + 6)).toBe('thrive')
})
