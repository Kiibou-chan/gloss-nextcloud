import { rememberItems } from './raw-json'
import { readFormat0 } from './format-0'
import { readFormat1 } from './format-1'
import type { ReviewRecord } from './record'
import type { NewId } from '../review/model'

export function readReview(json: unknown, newId: NewId): { record: ReviewRecord; notes: string[] } | { error: string } {
  if (typeof json === 'string') return parseReview(json, newId) ?? { error: 'This review is not a valid review.' }
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { error: 'This review is not a valid review.' }
  const value = json as Record<string, unknown>
  if (typeof value.format === 'number' && value.format > 1) return { error: 'This review was saved by a newer gloss.' }
  if (!('format' in value)) return readFormat0(value, newId)
  if (value.format === 1) return readFormat1(value)
  return { error: 'This review has an unsupported format.' }
}

export function parseReview(text: string, newId: NewId): ReturnType<typeof readReview> | null {
  try {
    const result = readReview(JSON.parse(text), newId)
    if (!('error' in result)) rememberItems(text, result.record.items)
    return result
  } catch { return null }
}
