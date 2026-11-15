import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { readReview } from '../../../src/domain/format/read'
import { writeReview } from '../../../src/domain/format/write'
import type { ReviewRecord } from '../../../src/domain/format/record'

for (const name of ['small', 'overall', 'sent']) {
  test(`writer round-trips ${name} and drops private or derived fields`, () => {
    const { format, ...record } = JSON.parse(readFileSync(`test/fixtures/review-1-${name}.json`, 'utf8'))
    const body = writeReview({ ...record, reviewer: 'synthetic', format: 0,
      items: record.items.map((item: object) => ({ ...item, shown: 'derived', proposalShown: 'derived' })),
    })
    expect(JSON.parse(body)).toEqual({ format: 1, ...record })
    expect(readReview(JSON.parse(body), () => 'unused0000')).toEqual({ record, notes: [] })
  })
}

test('2,000 items of the P4 shape fit within 1 MiB', () => {
  const at = '2026-11-15T10:00:00.000Z'
  const record: ReviewRecord = { revision: 1, name: 'Robin', draft: { file: 'paper.typ', etag: 'synthetic' },
    sent: false, sentAt: null, updatedAt: at,
    items: Array.from({ length: 2000 }, (_, i) => ({
      id: i.toString(36).padStart(10, '0'), kind: 'proposal', file: 'paper.typ', from: i * 40,
      quote: { exact: 'alpha beta gamma delta', prefix: 'a'.repeat(32), suffix: 'b'.repeat(32) },
      proposal: 'epsilon zeta eta theta', at,
      comments: [{ text: 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi', at }],
    })),
  }
  expect(Buffer.byteLength(writeReview(record), 'utf8')).toBeLessThan(1_048_576)
})
