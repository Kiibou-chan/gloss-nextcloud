import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import Ajv2020 from 'ajv/dist/2020.js'
import { readReview } from '../../../src/domain/format/read'
import { writeReview } from '../../../src/domain/format/write'

const schema = JSON.parse(readFileSync('schema/review-1.schema.json', 'utf8'))
const ajv = new Ajv2020({ strict: true })
const validate = ajv.compile(schema)
const fixture = (name = 'small'): any => JSON.parse(readFileSync(`test/fixtures/review-1-${name}.json`, 'utf8'))
for (const name of ['small', 'overall', 'sent']) {
  test(`schema accepts ${name} fixture and its writer output`, () => {
    const json = fixture(name)
    expect(validate(json), JSON.stringify(validate.errors)).toBe(true)
    const { format, ...record } = json
    expect(validate(JSON.parse(writeReview(record)))).toBe(true)
  })
}

test('migrated legacy record validates at revision 1', () => {
  let id = 0
  const result = readReview(JSON.parse(readFileSync('test/fixtures/review-0-spike.json', 'utf8')), () => `new000000${++id}`)
  if ('error' in result) throw Error(result.error)
  expect(validate(JSON.parse(writeReview({ ...result.record, revision: 1 })))).toBe(true)
})

for (const revision of [0, 1.5, undefined]) {
  test(`schema refuses revision ${revision}`, () => {
    const json = fixture()
    json.revision = revision
    expect(validate(json)).toBe(false)
  })
}

test('from explicitly counts UTF-16 code units', () => {
  expect(schema.$defs.anchored.properties.from.description).toContain('UTF-16 code units')
})

test.each([
  ['comment without comments', (json: any) => { json.items[1].comments = [] }],
  ['overall with quote', (json: any) => { json.items[2].quote = { exact: '', prefix: '', suffix: '' } }],
  ['two overall items', (json: any) => { json.items.push({ ...json.items[2], id: 'abc123def7' }) }],
  ['long name', (json: any) => { json.name = 'a'.repeat(101) }],
  ['long prefix', (json: any) => { json.items[0].quote.prefix = 'a'.repeat(33) }],
  ['id with trailing newline', (json: any) => { json.items[0].id += '\n' }],
  ['private key', (json: any) => { json.reviewer = 'synthetic' }],
  ['derived field', (json: any) => { json.items[0].shown = 'derived' }],
  ['non-integer offset', (json: any) => { json.items[0].from = 1.5 }],
  ['invalid time', (json: any) => { json.updatedAt = 'tomorrow' }],
])('schema refuses %s', (_, change) => {
  const json = fixture('overall')
  change(json)
  expect(validate(json)).toBe(false)
})
