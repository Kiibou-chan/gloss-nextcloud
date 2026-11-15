import { expect, it } from 'vitest'
import { readReview } from '../../../src/domain/format/read'
import { writeReview } from '../../../src/domain/format/write'
const at = '2026-11-15T20:00:00Z'
it('C1 keeps exact raw item slices through backups, including nested delimiters, escapes, and unknown fields', () => {
  const raw = '{ "id":"0000000001", "kind":"comment", "at":"' + at + '", "file":"old.txt", "from":0, "quote":{"exact":"\\u0061","prefix":"","suffix":"","more":[{}, "]}\\\"", 3]}, "comments":[{"text":"kept","at":"' + at + '","extra":null}], "extra": true }'
  const text = '{"format":1,"revision":1,"name":"Ada","draft":{"file":"old.txt","etag":"v1"},"sent":false,"sentAt":null,"updatedAt":"' + at + '","items":[' + raw + ']}'
  const result = readReview(text, () => '')
  if ('error' in result) throw Error(result.error)
  const body = writeReview({ ...result.record, items: [] }, result.record.items)
  expect(body).toContain(raw)
  const reload = readReview(body, () => '')
  if ('error' in reload) throw Error(reload.error)
  expect(writeReview({ ...reload.record, items: [] }, reload.record.items)).toContain(raw)
})
it('C1 still rejects missing required item fields and extra envelope fields', () => {
  const r = { revision: 1, name: 'Ada', draft: { file: 'a.txt', etag: '' }, sent: false, sentAt: null, updatedAt: at, items: [] }
  expect(readReview({ format: 1, ...r, extra: true }, () => '')).toHaveProperty('error')
  expect(readReview({ format: 1, ...r, items: [{ id: '0000000001', kind: 'comment', at, extra: true }] }, () => '')).toHaveProperty('error')
})
