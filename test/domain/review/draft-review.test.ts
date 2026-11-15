import { expect, test } from 'vitest'
import { DraftReview } from '../../../src/domain/review/draft-review'
import type { Item, NewId } from '../../../src/domain/review/model'
import { quoteAt, placeItems } from '../../../src/domain/text/quote'

const draft = 'alpha beta gamma'
const now = '2026-11-15T20:00:00Z'
const ids = (): NewId => { let n = 0; return () => String(++n).padStart(10, '0') }

test('overlap retains identity and comments, disappearance keeps a note on old words', () => {
  const review = new DraftReview('a.txt', draft)
  const next = ids()
  expect(review.edit([{ from: 6, to: 10, insert: 'new' }], next, now).changed).toEqual(new Set(['0000000001']))
  review.comment({ id: '0000000001' }, 'Check this', 'unused', now)
  review.edit([{ from: 7, to: 9, insert: 'ewer' }], next, 'later')
  expect(review.items()[0]).toMatchObject({ id: '0000000001', proposal: 'newer', comments: [{ text: 'Check this', at: now }], at: now })
  const result = review.edit([review.undoChange('0000000001')], next, 'later')
  expect(review.applied()).toBe(draft)
  expect(review.items()[0]).toMatchObject({ kind: 'comment', id: '0000000001', quote: { exact: 'beta' } })
  expect(result.changed).toEqual(new Set(['0000000001']))
  expect(result.removed.size).toBe(0)
})

test('selection targets proposals in draft coordinates and comments obey B8', () => {
  const review = new DraftReview('a.txt', draft)
  review.edit([{ from: 6, to: 10, insert: 'new' }], ids(), now)
  expect(review.targetFor(6, 6)).toEqual({ id: '0000000001' })
  expect(review.targetFor(7, 12)).toEqual({ id: '0000000001' })
  expect(review.targetFor(0, 5)).toEqual({ from: 0, to: 5 })
  review.comment(review.targetFor(0, 5), 'First', 'note000001', now)
  review.comment({ id: 'note000001' }, 'Second', 'unused', now)
  review.deleteComment('note000001', 0)
  expect(review.items().find(i => i.id === 'note000001')).toMatchObject({ comments: [{ text: 'Second', at: now }] })
  review.deleteComment('note000001', 0)
  expect(review.items().map(i => i.id)).toEqual(['0000000001'])
  review.comment({ id: '0000000001' }, 'Proposal comment', 'unused', now)
  review.deleteComment('0000000001', 0)
  expect(review.items()[0]).toMatchObject({ kind: 'proposal', comments: [] })
})

test.each([
  [0, 0, 'new '], [6, 10, ''], [6, 10, 'different words'],
] as const)('undo is an editor replacement for %s..%s', (from, to, insert) => {
  const review = new DraftReview('a.txt', draft)
  review.edit([{ from, to, insert }], ids(), now)
  const item = review.items()[0]!
  const undo = review.undoChange(item.id)
  expect(review.applied().slice(0, undo.from) + undo.insert + review.applied().slice(undo.to)).toBe(draft)
  expect(review.toApplied(0)).toBe(0)
  expect(review.fromApplied(0)).toEqual({ at: 0 })
})

test('rebuild and a sequence of edits produce the same items', () => {
  const review = new DraftReview('a.txt', draft)
  const next = ids()
  review.edit([{ from: 6, to: 10, insert: 'new' }], next, now)
  review.edit([{ from: 7, to: 9, insert: 'ewer' }], next, now)
  const rebuilt = new DraftReview('a.txt', draft)
  rebuilt.rebuild(review.applied(), ids(), now)
  expect(rebuilt.items()).toEqual(review.items())
  const before = review.items()
  expect(review.rebuild(review.applied(), next, now)).toEqual({ changed: new Set(), removed: new Set() })
  expect(review.items()).toEqual(before)
})

test('transactions use old coordinates and report removed proposals', () => {
  const review = new DraftReview('a.txt', draft)
  const next = ids()
  review.edit([{ from: 0, to: 5, insert: 'A' }, { from: 11, to: 16, insert: 'G' }], next, now)
  expect(review.applied()).toBe('A beta G')
  const result = review.rebuild(draft, next, now)
  expect(result.removed).toEqual(new Set(['0000000001', '0000000002']))
  expect(result.changed.size).toBe(0)
})

test('1,100 replacements plus one keystroke keep every id through edit and rebuild', () => {
  const source = Array.from({ length: 1100 }, (_, i) => `old${i} keep${i}\n`).join('')
  const records: Item[] = Array.from(source.matchAll(/old\d+/g), (m, i) => ({ kind: 'proposal', id: String(i).padStart(10, '0'), file: 'a.txt', from: m.index, quote: quoteAt(source, m.index, m.index + m[0].length), proposal: `new${i}`, comments: [], at: now }))
  const placed = placeItems(records, source).placed
  const review = new DraftReview('a.txt', source, placed)
  const rebuilt = new DraftReview('a.txt', source, placed)
  const text = review.applied()
  review.edit([{ from: 1, to: 1, insert: 'x' }], ids(), 'later')
  rebuilt.rebuild(text.slice(0, 1) + 'x' + text.slice(1), ids(), 'later')
  expect(review.items().map(i => i.id)).toEqual(records.map(i => i.id))
  expect(rebuilt.items()).toEqual(review.items())
  const fresh = new DraftReview('a.txt', source)
  fresh.rebuild(text, (() => { let i = 0; return () => String(i++).padStart(10, '0') })(), now)
  expect(fresh.items()).toEqual(records)
})
