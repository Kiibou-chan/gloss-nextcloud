import { expect, test } from 'vitest'
import { DraftReview } from '../../../src/domain/review/draft-review'
import { regions } from '../../../src/domain/review/region'
import type { Proposal } from '../../../src/domain/review/model'
import { quoteAt } from '../../../src/domain/text/quote'
import { writeReview } from '../../../src/domain/format/write'

const now = '2026-11-15T20:00:00Z'
const ids = () => { let id = 0; return () => `n${String(++id).padStart(9, '0')}` }
const proposal = (draft: string, from: number, to: number, id: string, replacement = 'new'): Proposal => ({
  kind: 'proposal', id, file: 'a.txt', from, quote: quoteAt(draft, from, to), proposal: replacement,
  comments: [{ text: `Comment ${id}`, at: now }], at: now,
})

function seededDraft(): string {
  let seed = 0x54b
  const words = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta']
  return Array.from({ length: 10000 }, (_, i) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return `line${i} ${words[seed % words.length]} steady ${i % 3 === 0 && i < 9000 ? 'target' : 'stable'} ending\n`
  }).join('')
}

function materialise(draft: string, review: DraftReview): string {
  let pos = 0, text = ''
  for (const p of review.items()) if (p.kind === 'proposal') {
    expect(p.from).toBeGreaterThanOrEqual(pos)
    text += draft.slice(pos, p.from) + p.proposal
    pos = p.from + p.quote.exact.length
  }
  return text + draft.slice(pos)
}

test('widens changes separately to lines and merges only touching regions', () => {
  const text = 'alpha beta\ngamma delta\nepsilon zeta\n'
  expect(regions(text, [{ from: 1, to: 2, insert: 'A' }, { from: 25, to: 26, insert: 'Z' }], [])).toEqual([
    { from: 0, to: 10 }, { from: 23, to: 35 },
  ])
  expect(regions(text, [{ from: 1, to: 2, insert: '' }, { from: 4, to: 5, insert: '' }], [])).toEqual([{ from: 0, to: 10 }])
})

test('widens across touching multiline proposals and whitespace joins until an unchanged word', () => {
  const draft = 'alpha beta\ngamma delta\nepsilon zeta\nlast word'
  const p = proposal(draft, 6, 27, 'p000000001', 'x\ny')
  const review = new DraftReview('a.txt', draft, [p])
  const result = regions(review.applied(), [{ from: 1, to: 1, insert: 'x' }], [p])
  expect(result).toEqual([{ from: 0, to: 9 }])
})

test.each([false, true])('loaded adjacent proposals join once, keeping the first id and comments (both commented: %s)', both => {
  const draft = 'alpha beta unchanged ending'
  const first = proposal(draft, 0, 5, 'p000000001', 'x')
  const second = proposal(draft, 6, 10, 'p000000002', 'y')
  if (!both) second.comments = []
  const review = new DraftReview('a.txt', draft, [first, second])
  expect(review.items()).toHaveLength(1)
  expect(review.items()[0]).toMatchObject({ id: first.id, proposal: 'x y', quote: { exact: 'alpha beta' },
    comments: [{ text: both ? 'Comment p000000001\nComment p000000002' : 'Comment p000000001', at: now }] })
  const before = structuredClone(review.items()[0])
  const result = review.edit([{ from: review.applied().length, to: review.applied().length, insert: '!' }], ids(), now)
  expect(review.items().find(p => p.id === first.id)).toEqual(before)
  expect(result.changed.has(first.id)).toBe(false)
  expect(result.removed.size).toBe(0)
})

test('word cap falls back to changed line runs, preserving unchanged lines', () => {
  const draft = `${'alpha '.repeat(1200)}\nunchanged middle\n${'beta '.repeat(1200)}\n`
  const text = `${'gamma '.repeat(1200)}\nunchanged middle\n${'delta '.repeat(1200)}\n`
  const review = new DraftReview('a.txt', draft)
  review.edit([{ from: 0, to: draft.length, insert: text }], ids(), now)
  expect(review.items().filter(p => p.kind === 'proposal').map(p => p.quote.exact)).toEqual([`${'alpha '.repeat(1200)}\n`, `${'beta '.repeat(1200)}\n`])
  expect(materialise(draft, review)).toBe(text)
})

test('line cap falls back to one exact replacement', () => {
  const draft = 'alpha\n'.repeat(1100), text = 'beta\n'.repeat(1100)
  const review = new DraftReview('a.txt', draft)
  review.edit([{ from: 0, to: draft.length, insert: text }], ids(), now)
  expect(review.items()).toHaveLength(1)
  expect(review.items()[0]).toMatchObject({ quote: { exact: draft }, proposal: text })
  expect(materialise(draft, review)).toBe(text)
})

test('3,000 replace-all regions preserve 200 earlier commented proposals and fit the save limit', () => {
  const draft = seededDraft()
  const previous = Array.from(draft.matchAll(/line\d+/g)).filter((_, i) => i % 50 === 1).map((m, i) => proposal(draft, m.index, m.index + m[0].length, `p${String(i).padStart(9, '0')}`))
  expect(previous).toHaveLength(200)
  const review = new DraftReview('a.txt', draft, previous)
  const before = review.applied()
  const edits = Array.from(before.matchAll(/target/g), m => ({ from: m.index, to: m.index + 6, insert: 'replacement' }))
  expect(edits).toHaveLength(3000)
  expect(regions(before, edits, previous)).toHaveLength(3000)
  review.edit(edits, ids(), now)
  expect(materialise(draft, review)).toBe(before.replaceAll('target', 'replacement'))
  for (const p of previous) expect(review.items().find(item => item.id === p.id)).toEqual(p)
  const bytes = Buffer.byteLength(writeReview({ revision: 1, name: 'Synthetic reviewer', draft: { file: 'a.txt', etag: 'synthetic' }, sent: false, sentAt: null, updatedAt: now, items: [...review.items()] }))
  console.log(`replace-all review: ${bytes} bytes`)
  expect(bytes).toBeLessThan(1048576)
}, 30000)
