import { parseReview } from '../domain/format/read'
import type { Backup, Ids } from './ports'

export function readBackup(review: string, ids: Ids): ReturnType<typeof parseReview> {
  return parseReview(review, () => ids.item())
}

export function keptText(backup: Backup, ids: Ids): string {
  const result = readBackup(backup.review, ids)
  if (!result || 'error' in result) return backup.review
  return result.record.items.map(item => item.kind === 'overall' ? `Comment: ${item.text}` :
    [`Text: ${item.quote.exact}`, ...(item.kind === 'proposal' ? [`Proposed: ${item.proposal}`] : []), ...item.comments.map(c => `Comment: ${c.text}`)].join('\n')).join('\n\n')
}
