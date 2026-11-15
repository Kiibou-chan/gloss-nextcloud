import { expect, test } from 'vitest'
import { DraftReview } from '../../../src/domain/review/draft-review'
import type { Item } from '../../../src/domain/review/model'
import { placeItems, quoteAt } from '../../../src/domain/text/quote'

test('500 seeded edit sequences from empty and placed reviews preserve the applied invariant', () => {
  let seed = 0x54a
  const random = (n: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n }
  const draft = 'alpha beta gamma\ndelta epsilon zeta\n𝒜 eta theta\n'
  const now = '2026-11-15T20:00:00Z'
  const records: Item[] = [
    { kind: 'proposal', id: 'placed0001', file: 'a.txt', from: 0, quote: quoteAt(draft, 0, 5), proposal: 'new', comments: [], at: now },
    { kind: 'proposal', id: 'placed0002', file: 'a.txt', from: 2, quote: quoteAt(draft, 2, 5), proposal: 'overlap', comments: [{ text: 'Kept', at: now }], at: now },
    { kind: 'proposal', id: 'placed0003', file: 'a.txt', from: 17, quote: quoteAt(draft, 17, 17), proposal: 'insert ', comments: [], at: now },
  ]
  for (let sequence = 0; sequence < 500; sequence++) {
    for (const initial of [[], placeItems(records, draft).placed]) {
      const review = new DraftReview('a.txt', draft, initial)
      let editor = review.applied()
      let id = 0
      for (let step = 0, count = 1 + random(20); step < count; step++) {
        const from = random(editor.length + 1)
        const to = from + random(editor.length - from + 1)
        const mode = random(3)
        const insert = mode === 0 ? '' : ['alpha', ' ', '\n', '𝒜', 'x', 'beta gamma'][random(6)]!
        const end = mode === 1 ? from : to
        editor = editor.slice(0, from) + insert + editor.slice(end)
        review.edit([{ from, to: end, insert }], () => String(++id).padStart(10, '0'), now)
        let applied = '', pos = 0
        const proposals = review.items().filter(i => i.kind === 'proposal').sort((a, b) => a.from - b.from)
        for (const p of proposals) {
          expect(p.from).toBeGreaterThanOrEqual(pos)
          applied += draft.slice(pos, p.from) + p.proposal
          pos = p.from + p.quote.exact.length
        }
        expect(applied + draft.slice(pos), `sequence ${sequence}, step ${step}`).toBe(editor)
        expect(review.applied()).toBe(editor)
        expect(new Set(review.items().map(i => i.id)).size).toBe(review.items().length)
      }
    }
  }
})
