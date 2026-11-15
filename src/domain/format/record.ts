import type { Overall } from '../review/model'

interface ReviewComment { text: string; at: string }
interface ReviewQuote { exact: string; prefix: string; suffix: string }
interface AnchoredItem {
  id: string
  file: string
  /** Start in the draft, in UTF-16 code units. */
  from: number
  quote: ReviewQuote
  comments: ReviewComment[]
  at: string
}
interface ProposalItem extends AnchoredItem { kind: 'proposal'; proposal: string }
interface CommentItem extends AnchoredItem { kind: 'comment' }
type OverallItem = Overall
export type ReviewItem = ProposalItem | CommentItem | OverallItem
export interface ReviewRecord {
  /** Zero only for a migrated format 0 review that has not been saved yet. */
  revision: number
  name: string
  draft: { file: string; etag: string }
  sent: boolean
  sentAt: string | null
  updatedAt: string
  items: ReviewItem[]
}
export type ReadResult = { record: ReviewRecord; notes: string[] } | { error: string }
