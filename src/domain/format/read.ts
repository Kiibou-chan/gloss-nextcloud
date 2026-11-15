import { readFormat0 } from './format-0'
import { readFormat1 } from './format-1'
import type { NewId, ReviewRecord } from './record'

export function readReview(json: unknown, newId: NewId): { record: ReviewRecord; notes: string[] } | { error: string } {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { error: 'This review is not a valid review.' }
  const value = json as Record<string, unknown>
  if (typeof value.format === 'number' && value.format > 1) return { error: 'This review was saved by a newer gloss.' }
  if (!('format' in value)) return readFormat0(value, newId)
  if (value.format === 1) return readFormat1(value)
  return { error: 'This review has an unsupported format.' }
}
