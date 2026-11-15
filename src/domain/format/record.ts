import type { Item } from '../review/model'

export type ReviewItem = Item
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
