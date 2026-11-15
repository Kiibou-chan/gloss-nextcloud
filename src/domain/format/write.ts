import type { Item } from '../review/model'
import { originalItem } from './raw-json'
import type { ReviewRecord } from './record'

export function writeReview(r: ReviewRecord, unplaced: readonly Item[] = []): string {
  const json = JSON.stringify({ format: 1, revision: r.revision, name: r.name,
    draft: { file: r.draft.file, etag: r.draft.etag }, sent: r.sent,
    sentAt: r.sentAt, updatedAt: r.updatedAt,
    items: r.items.map((item): Item => {
      const base = { id: item.id, at: item.at }
      if (item.kind === 'overall') return { ...base, kind: 'overall', text: item.text }
      const anchored = { ...base, file: item.file, from: item.from,
        quote: { exact: item.quote.exact, prefix: item.quote.prefix, suffix: item.quote.suffix },
        comments: item.comments.map(c => ({ text: c.text, at: c.at })),
      }
      return item.kind === 'proposal' ? { ...anchored, kind: 'proposal', proposal: item.proposal } : { ...anchored, kind: 'comment' }
    }),
  })
  if (!unplaced.length) return json
  const extra = unplaced.map(originalItem).join(',')
  return json.slice(0, -2) + (r.items.length ? ',' : '') + extra + ']}'
}
