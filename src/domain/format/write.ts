import type { ReviewRecord } from './record'

export function writeReview(r: ReviewRecord): string {
  return JSON.stringify({ format: 1, revision: r.revision, name: r.name,
    draft: { file: r.draft.file, etag: r.draft.etag }, sent: r.sent,
    sentAt: r.sentAt, updatedAt: r.updatedAt,
    items: r.items.map(item => {
      const base = { id: item.id, kind: item.kind, at: item.at }
      if (item.kind === 'overall') return { ...base, text: item.text }
      return { ...base, file: item.file, from: item.from,
        quote: { exact: item.quote.exact, prefix: item.quote.prefix, suffix: item.quote.suffix },
        comments: item.comments.map(c => ({ text: c.text, at: c.at })),
        ...(item.kind === 'proposal' ? { proposal: item.proposal } : {}),
      }
    }),
  })
}
