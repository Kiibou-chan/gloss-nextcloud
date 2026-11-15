import { readReview } from '../domain/format/read'
import type { Backup, Ids } from './ports'

export function readBackup(review: string, ids: Ids): ReturnType<typeof readReview> | null {
  try { return readReview(JSON.parse(review), () => ids.item()) } catch { return null }
}

export function keptText(backup: Backup, ids: Ids): string {
  const result = readBackup(backup.review, ids)
  if (!result || 'error' in result) return backup.review
  return result.record.items.map(item => item.kind === 'overall' ? item.text :
    [item.quote.exact, ...(item.kind === 'proposal' ? [item.proposal] : []), ...item.comments.map(c => c.text)].join('\n')).join('\n\n')
}
