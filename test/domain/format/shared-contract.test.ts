import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
it('M-c format and placement share the canonical review item model', () => {
  const record = readFileSync('src/domain/format/record.ts', 'utf8'), quote = readFileSync('src/domain/text/quote.ts', 'utf8')
  expect(record).toMatch(/import type.*Item.*review\/model/)
  expect(quote).toMatch(/import type.*Item.*review\/model/)
  expect(record + quote).not.toMatch(/interface AnchoredItem|type AnchoredRecord/)
})
it('M-d queue and HTTP adapter share UTF-8 measurement and the session-ended sentence', () => {
  const queue = readFileSync('src/app/save-queue.ts', 'utf8'), api = readFileSync('src/adapters/http/review-api.ts', 'utf8')
  expect(queue).toMatch(/import.*utf8Length/); expect(api).toMatch(/import.*utf8Length/)
  expect(queue).toMatch(/import.*SESSION_ENDED/); expect(api).toMatch(/import.*SESSION_ENDED/)
  expect(queue + api).not.toContain('Your session ended. Reload')
})
