import { expect, test } from 'vitest'
import { DraftReview } from '../../../src/domain/review/draft-review'
import type { Proposal } from '../../../src/domain/review/model'
import { quoteAt } from '../../../src/domain/text/quote'

const now = '2026-11-15T20:00:00Z'
// Five calibration runs, worst / median in ms:
// 2.404 / 0.535; 2.675 / 0.515; 2.411 / 0.489; 2.503 / 0.515; 2.393 / 0.501.
// Three times the worst sample; every sample is logged before its assertion.
const boundMs = 3 * 2.675

test('30 seeded keystrokes on 10,000 lines with 2,000 proposals', () => {
  let seed = 0x54b
  const random = (n: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n }
  const draft = Array.from({ length: 10000 }, (_, i) => `line${i} alpha beta gamma delta epsilon zeta theta\n`).join('')
  const placed: Proposal[] = Array.from(draft.matchAll(/alpha/g)).filter((_, i) => i % 5 === 0).map((m, i) => ({
    kind: 'proposal', id: `p${String(i).padStart(9, '0')}`, file: 'a.txt', from: m.index, quote: quoteAt(draft, m.index, m.index + 5), proposal: 'changed', comments: [{ text: 'Synthetic comment', at: now }], at: now,
  }))
  const review = new DraftReview('a.txt', draft, placed)
  let id = 0
  const samples: number[] = []
  for (let i = 0; i < 30; i++) {
    const from = random(review.applied().length + 1)
    const start = performance.now()
    review.edit([{ from, to: from, insert: 'x' }], () => `n${String(++id).padStart(9, '0')}`, now)
    const elapsed = performance.now() - start
    samples.push(elapsed)
    console.log(`keystroke ${i + 1}: ${elapsed.toFixed(3)} ms`)
  }
  samples.sort((a, b) => a - b)
  console.log(`keystroke worst ${samples[29]!.toFixed(3)} ms; median ${((samples[14]! + samples[15]!) / 2).toFixed(3)} ms`)
  for (const sample of samples) expect(sample).toBeLessThan(boundMs)
  // N2 keeps this infrequent path uncapped; record its cost without a timing bound.
  const rebuilt = new DraftReview('a.txt', draft, placed)
  const start = performance.now()
  rebuilt.rebuild(review.applied(), () => `r${String(++id).padStart(9, '0')}`, now)
  console.log(`10,000-line / 2,000-proposal rebuild: ${(performance.now() - start).toFixed(3)} ms`)
  expect(rebuilt.applied()).toBe(review.applied())
})

test('6,000-word replace-all paste stays bounded', () => {
  const draft = 'alpha '.repeat(6000), text = 'beta '.repeat(6000)
  const review = new DraftReview('a.txt', draft)
  const start = performance.now()
  review.edit([{ from: 0, to: draft.length, insert: text }], () => 'n000000001', now)
  const elapsed = performance.now() - start
  console.log(`6,000-word paste: ${elapsed.toFixed(3)} ms`)
  expect(elapsed).toBeLessThan(300)
  expect(review.applied()).toBe(text)
  expect(review.items()).toHaveLength(1)
})
