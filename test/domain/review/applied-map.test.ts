import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { AppliedMap } from '../../../src/domain/review/applied-map'
import { quoteAt } from '../../../src/domain/text/quote'

const golden = JSON.parse(readFileSync(new URL('../../fixtures/spike/applied.json', import.meta.url), 'utf8')) as {
  cases: { input: { draft: string; proposals: { id: string; from: number; to: number; text: string }[]; sourceOffsets: number[]; appliedOffsets: number[] }; expected: { toApplied: number[]; fromApplied: ({ at: number } | { inside: { id: string } })[] } }[]
}
test.each(golden.cases)('agrees with spike offset mapping: %#', ({ input, expected }) => {
  const map = new AppliedMap(input.proposals.map(p => ({ id: p.id, kind: 'proposal' as const, file: 'a.txt', from: p.from, quote: quoteAt(input.draft, p.from, p.to), proposal: p.text, comments: [], at: 'then' })))
  expect(input.sourceOffsets.map(p => map.toApplied(p))).toEqual(expected.toApplied)
  expect(input.appliedOffsets.map(q => map.fromApplied(q))).toEqual(expected.fromApplied.map(p => 'inside' in p ? { inside: p.inside.id } : p))
})
test('M-b exposes sorted spans with draft and applied bounds, including insertions and deletions', () => {
  const p = (id: string, from: number, exact: string, proposal: string) => ({ id, kind: 'proposal' as const, file: 'a.txt', from, quote: { exact, prefix: '', suffix: '' }, proposal, comments: [], at: 'then' })
  const insertion = p('insert', 1, '', 'long'), deletion = p('delete', 3, 'xx', '')
  expect(new AppliedMap([deletion, insertion]).spans()).toEqual([
    { item: insertion, end: 1, start: 1, appliedEnd: 5, delta: 4 },
    { item: deletion, end: 5, start: 7, appliedEnd: 7, delta: 2 },
  ])
})
