import { expect, test } from 'vitest'
import { compiledDoc } from '../../src/app/compiled-doc'
import { toSource } from '../../src/domain/pdf/match'
import { DraftReview } from '../../src/domain/review/draft-review'
import { parseTypst } from '../../src/domain/source/typst-parse'
import { diffSource, newSource } from '../../src/domain/typst/generated'

const DRAFT = 'Alpha beta gamma delta.\n'
const ops = parseTypst(DRAFT)
const none = { unwrap: new Set<string>(), omit: new Set<string>() }
function review() {
  const r = new DraftReview('paper.typ', DRAFT)
  r.edit([{ from: 6, to: 10, insert: 'zeta' }], () => 'p1', '2026-11-16T10:00:00Z')
  return r
}

test('selecting copied, old, and new words of the Changes text gives the draft range', () => {
  const g = diffSource(review(), DRAFT, ops, none), doc = compiledDoc('paper.typ', DRAFT, ops, g)
  expect(doc.source.text).toBe(g.text)
  const draftOf = (text: string) => { const hit = toSource(doc.source, text, 0)!; return doc.toDraft(hit.from, hit.to) }
  expect(draftOf('gamma')).toEqual({ from: 11, to: 16 })
  expect(draftOf('beta')).toEqual({ from: 6, to: 10 })
  expect(draftOf('zeta')).toEqual({ from: 6, to: 10 })
})

test('selecting on the New text gives the draft range', () => {
  const g = newSource(review(), DRAFT, ops, none), doc = compiledDoc('paper.typ', DRAFT, ops, g)
  const hit = toSource(doc.source, 'zeta', 0)!
  expect(doc.toDraft(hit.from, hit.to)).toEqual({ from: 6, to: 10 })
})

test('a draft range maps into the generated text, and the new words of a proposal are found by id', () => {
  const g = diffSource(review(), DRAFT, ops, none), doc = compiledDoc('paper.typ', DRAFT, ops, g)
  expect(g.text.slice(doc.fromDraft(11), doc.fromDraft(11) + 5)).toBe('gamma')
  const range = doc.newRange('p1')!
  expect(g.text.slice(range.from, range.to)).toBe('zeta')
  expect(doc.newRange('absent')).toBeNull()
  expect([...doc.shown]).toEqual(['p1'])
})

test('the draft-only document maps every offset to itself and shows nothing of a proposal', () => {
  const doc = compiledDoc('paper.typ', DRAFT, ops, null)
  expect(doc.source.text).toBe(DRAFT)
  expect(doc.toDraft(3, 9)).toEqual({ from: 3, to: 9 })
  expect(doc.fromDraft(7)).toBe(7)
  expect(doc.newRange('p1')).toBeNull()
  expect(doc.shown.size).toBe(0)
})
