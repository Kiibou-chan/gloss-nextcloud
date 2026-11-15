import type { ReadResult, ReviewRecord, ReviewItem } from './record'

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function required(value: Record<string, unknown>, allowed: string[]): boolean { return allowed.every(key => key in value) }
function keys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key)) && allowed.every(key => key in value)
}
function time(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/.test(value)
}
// Calendar arithmetic keeps validation deterministic and independent of a clock.
// The schema checks timestamp syntax; both readers add this calendar check.
export function calendarError(json: Record<string, unknown>): string | undefined {
  const fields: [string, unknown][] = [['updatedAt', json.updatedAt], ['sentAt', json.sentAt]]
  if (Array.isArray(json.items)) {
    json.items.forEach((entry, index) => {
      if (!object(entry)) return
      fields.push([`items.${index}.at`, entry.at])
      if (Array.isArray(entry.comments)) {
        entry.comments.forEach((comment, commentIndex) => {
          if (object(comment)) fields.push([`items.${index}.comments.${commentIndex}.at`, comment.at])
        })
      }
    })
  }
  for (const [field, value] of fields) {
    if (!time(value)) continue // Other validation reports malformed timestamp syntax.
    const year = Number(value.slice(0, 4))
    const month = Number(value.slice(5, 7))
    const day = Number(value.slice(8, 10))
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!
    if (day > days) return `Invalid calendar date in ${field}.`
  }
  return undefined
}

function item(value: unknown): value is ReviewItem {
  if (!object(value) || typeof value.id !== 'string' || !/^[a-z0-9]{10}$/.test(value.id) || !time(value.at)) return false
  if (value.kind === 'overall') return required(value, ['id', 'kind', 'text', 'at']) && typeof value.text === 'string'
  if (value.kind !== 'proposal' && value.kind !== 'comment') return false
  if (!required(value, ['id', 'kind', 'file', 'from', 'quote', 'comments', 'at', ...(value.kind === 'proposal' ? ['proposal'] : [])])) return false
  if (typeof value.file !== 'string' || !Number.isInteger(value.from) || (value.from as number) < 0) return false
  if (!object(value.quote) || !required(value.quote, ['exact', 'prefix', 'suffix'])) return false
  const quote = value.quote
  if (typeof quote.exact !== 'string' || typeof quote.prefix !== 'string' || typeof quote.suffix !== 'string' || [...quote.prefix].length > 32 || [...quote.suffix].length > 32) return false
  if (!Array.isArray(value.comments) || (value.kind === 'comment' && value.comments.length === 0)) return false
  if (!value.comments.every(c => object(c) && required(c, ['text', 'at']) && typeof c.text === 'string' && time(c.at))) return false
  return value.kind !== 'proposal' || typeof value.proposal === 'string'
}

export function readFormat1(json: unknown): ReadResult {
  const invalid = { error: 'This review is not a valid format 1 review.' }
  if (!object(json) || !keys(json, ['format', 'revision', 'name', 'draft', 'sent', 'sentAt', 'updatedAt', 'items'])) return invalid
  const error = calendarError(json)
  if (error) return { error }
  if (json.format !== 1 || !Number.isInteger(json.revision) || (json.revision as number) < 1) return invalid
  if (typeof json.name !== 'string' || [...json.name].length < 1 || [...json.name].length > 100) return invalid
  if (!object(json.draft) || !keys(json.draft, ['file', 'etag']) || typeof json.draft.file !== 'string' || typeof json.draft.etag !== 'string') return invalid
  if (typeof json.sent !== 'boolean' || !(json.sentAt === null || time(json.sentAt)) || !time(json.updatedAt)) return invalid
  if (!Array.isArray(json.items) || !json.items.every(item)) return invalid
  if (json.items.filter(i => i.kind === 'overall').length > 1 || new Set(json.items.map(i => i.id)).size !== json.items.length) return invalid
  const { format: _format, ...record } = json
  return { record: record as unknown as ReviewRecord, notes: [] }
}
