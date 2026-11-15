import { parseReview } from '../domain/format/read'
import type { Backup, Ids } from './ports'

export function readBackup(review: string, ids: Ids): ReturnType<typeof parseReview> {
  return parseReview(review, () => ids.item())
}

export function keptText(backup: Backup, ids: Ids): string {
  const result = readBackup(backup.review, ids)
  if (!result || 'error' in result) return backup.review
  return result.record.items.map(item => item.kind === 'overall' ? item.text :
    [item.quote.exact, ...(item.kind === 'proposal' ? [item.proposal] : []), ...item.comments.map(c => c.text)].join('\n')).join('\n\n')
}
