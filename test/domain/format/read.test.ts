import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { readReview } from '../../../src/domain/format/read'

const fixture = (name: string): any => JSON.parse(readFileSync(`test/fixtures/${name}.json`, 'utf8'))
const newId = () => 'new0000001'

for (const name of ['small', 'overall', 'sent']) {
  test(`format 1 ${name} reads unchanged without requesting ids`, () => {
    const { format, ...record } = fixture(`review-1-${name}`)
    expect(readReview({ format, ...record }, () => { throw Error('unexpected id') })).toEqual({ record, notes: [] })
  })
}

test('legacy migration assigns fresh ids, paths, revision, and the latest timestamp', () => {
  let id = 0
  const legacy = fixture('review-0-spike')
  const result = readReview(legacy, () => `new000000${++id}`)
  expect(result).toEqual({ record: {
    revision: 0, name: 'Robin', draft: { file: 'paper.typ', etag: '' }, sent: true,
    sentAt: '2026-11-15T11:00:00.000Z', updatedAt: '2026-11-15T11:00:00.000Z',
    items: legacy.items.map((item: any, i: number) => {
      const { shown, proposalShown, ...kept } = item
      return { ...kept, id: `new000000${i + 1}`, file: 'paper.typ' }
    }),
  }, notes: [] })
  expect(id).toBe(2)
})

test('empty legacy reviews receive the fixed epoch', () => {
  expect(readReview({ name: 'Robin', draft: 'paper.typ', sent: false, items: [] }, newId)).toEqual({ record: {
    name: 'Robin', draft: { file: 'paper.typ', etag: '' }, sent: false, sentAt: null,
    updatedAt: '1970-01-01T00:00:00.000Z', revision: 0, items: [],
  }, notes: [] })
})

for (const value of [undefined, 42, 'not an ISO time']) {
  test(`legacy malformed timestamp ${value} is refused`, () => {
    const legacy = fixture('review-0-spike')
    legacy.items[0].comments[0].at = value
    expect(readReview(legacy, newId)).toHaveProperty('error')
  })
}

test('newer formats have the agreed message', () => {
  expect(readReview({ format: 2 }, newId)).toEqual({ error: 'This review was saved by a newer gloss.' })
})

test.each([null, [], true, {}, { format: '1' }, { format: 0 }, { format: 1 }])('malformed input is refused: %j', json => {
  expect(readReview(json, newId)).toHaveProperty('error')
})

test('format 1 refuses malformed records and duplicate ids', () => {
  const json = fixture('review-1-small')
  json.items[1].id = json.items[0].id
  expect(readReview(json, newId)).toHaveProperty('error')
  json.items[1].id = 'short'
  expect(readReview(json, newId)).toHaveProperty('error')
})

test('format 1 refuses ids with a trailing newline', () => {
  const json = fixture('review-1-small')
  json.items[0].id += '\n'
  expect(readReview(json, newId)).toHaveProperty('error')
})

const timestampFields = [
  'updatedAt', 'sentAt', 'items.0.at', 'items.0.comments.0.at',
  'items.1.at', 'items.1.comments.0.at', 'items.2.at',
]
function setField(json: any, field: string, value: string): void {
  const parts = field.split('.')
  const key = parts.pop()!
  const parent = parts.reduce((current, part) => current[part], json)
  parent[key] = value
}

for (const field of timestampFields) {
  test(`format 1 checks calendar dates in ${field} and accepts leap days`, () => {
    const json = fixture(field === 'updatedAt' ? 'review-1-small' : 'review-1-overall')
    for (const invalid of ['2026-02-30T10:00:00.000Z', '1900-02-29T10:00:00.000Z', '2026-04-31T10:00:00.000+02:00']) {
      setField(json, field, invalid)
      const result = readReview(json, newId)
      expect(result).toHaveProperty('error')
      if ('error' in result) expect(result.error).toContain(field)
    }
    for (const valid of ['2028-02-29T10:00:00.000Z', '2000-02-29T23:30:00.000-02:00']) {
      setField(json, field, valid)
      expect(readReview(json, newId)).toHaveProperty('record')
    }
  })
}

for (const field of ['items.0.at', 'items.0.comments.0.at', 'items.1.at', 'items.1.comments.0.at']) {
  test(`legacy checks calendar dates in ${field} and accepts leap days`, () => {
    const json = fixture('review-0-spike')
    setField(json, field, '2026-02-30T10:00:00.000Z')
    let id = 0
    const result = readReview(json, () => `new000000${++id}`)
    expect(result).toHaveProperty('error')
    if ('error' in result) expect(result.error).toContain(field)
    setField(json, field, '2028-02-29T10:00:00.000Z')
    id = 0
    expect(readReview(json, () => `new000000${++id}`)).toHaveProperty('record')
  })
}
