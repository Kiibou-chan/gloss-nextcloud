import { readFormat1 } from './format-1'
import type { NewId, ReadResult } from './record'

export function readFormat0(json: Record<string, unknown>, newId: NewId): ReadResult {
  const invalid = { error: 'This review is not a valid format 0 review.' }
  if (typeof json.draft !== 'string' || !Array.isArray(json.items)) return invalid
  const items: Record<string, unknown>[] = []
  const times: string[] = []
  for (const entry of json.items) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return invalid
    const old = entry as Record<string, unknown>
    if (old.kind !== 'proposal' && old.kind !== 'comment') return invalid
    if (typeof old.at !== 'string' || !Array.isArray(old.comments)) return invalid
    times.push(old.at)
    const comments: { text: unknown; at: string }[] = []
    for (const comment of old.comments) {
      if (!comment || typeof comment !== 'object' || typeof comment.at !== 'string') return invalid
      comments.push({ text: comment.text, at: comment.at })
      times.push(comment.at)
    }
    items.push({ id: newId(), kind: old.kind, file: json.draft, from: old.from,
      quote: old.quote, comments, at: old.at,
      ...(old.kind === 'proposal' ? { proposal: old.proposal } : {}),
    })
  }
  // Spike timestamps are UTC ISO strings produced by toISOString().
  if (times.some(at => !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(at))) return invalid
  const updatedAt = times.sort().at(-1) ?? '1970-01-01T00:00:00.000Z'
  const result = readFormat1({ format: 1, revision: 1, name: json.name,
    draft: { file: json.draft, etag: '' }, sent: json.sent,
    sentAt: json.sent ? updatedAt : null, updatedAt, items,
  })
  return 'error' in result ? invalid : { record: { ...result.record, revision: 0 }, notes: result.notes }
}
