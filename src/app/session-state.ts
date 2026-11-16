import type { Item } from '../domain/review/model'
import { CommentDraft } from './comment-draft'
import type { ReviewRecord } from '../domain/format/record'
import type { DraftReview } from '../domain/review/draft-review'
import type { sourceKey } from '../domain/pdf/match'
import type { plainOps } from '../domain/source/typst-parse'
import type { Backup, Failure, Ports } from './ports'
import type { HeadView, ViewMode } from './view'
import type { SaveQueue } from './save-queue'
import type { languageOf } from '../domain/source/language'

export type MainDraft = { file: string; text: string; etag: string; language: ReturnType<typeof languageOf> }
export interface SessionActions {
  backup(dirty: boolean): void
  changed(): void
  clearLinkMessage(): void
  createQueue(backup?: Backup | null): void
  deferPdf(): void
  editable(): boolean
  head(): void
  install(record: ReviewRecord): void
  keepConflict(backup: Backup): void
  overallText(): string
  publishLink(): void
  refusal(failure: Failure, prefix: string): { text: string; blocks: boolean }
  render(): void
  setView(view: ViewMode): Promise<void>
}

/** Shared review data; each job owns its timers and presentation caches. */
export class SessionState {
  readonly commentDraft: CommentDraft
  disposed = false
  listeners: (() => void)[] = []
  unplaced: Item[] = []
  saved = false
  blocked = false
  pendingName = ''
  overallDraft = ''
  blankName = false
  draft = ''
  file = ''
  etag = ''
  review: DraftReview | null = null
  record: ReviewRecord | null = null
  key = ''
  status = ''
  form: HeadView['form'] = null
  view: ViewMode = 'editor'
  loading = false
  generation = 0
  queue: SaveQueue | null = null
  backupFailed = false
  conflictText: string | null = null
  source: ReturnType<typeof sourceKey> | null = null
  ops: ReturnType<typeof plainOps> = []
  constructor(readonly ports: Ports, readonly page = { address: '', fragment: '' }, readonly main?: MainDraft) { this.commentDraft = new CommentDraft(this, ports.clock) }
}
