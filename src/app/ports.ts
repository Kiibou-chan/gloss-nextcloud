import type { PdfPlacement } from '../domain/pdf/match'
import type { PdfCaret } from '../domain/pdf/proposal-marks'
import type { Diagnostic } from '../domain/typst/diagnostic'
import type { Change } from '../domain/review/model'
import type { UnplacedView, CardView, DeletedWords, EditorMark, HeadView, ViewMode, PdfLook } from './view'
export type { Change } from '../domain/review/model'
export interface EditorPort {
  onAttempt?(listener: () => void): void | (() => void)
  selection?(): { from: number; to: number }
  dispose?(): void
  setText(text: string): void
  text(): string
  replace(change: Change): void
  setMarks(marks: readonly EditorMark[], deleted: readonly DeletedWords[]): void
  setEditable(on: boolean): void
  scrollTo(pos: number): void
  onEdit(listener: (changes: readonly Change[]) => void): void | (() => void)
  onSelect(listener: (range: { from: number; to: number }) => void): void | (() => void)
}
export type PdfMark = (PdfPlacement & { look: 'note' | 'struck' | 'margin' }) | (PdfCaret & { look: 'insert'; words: string })
export interface PdfPort {
  commentSelection?(): boolean
  dispose?(): void
  show(): Promise<{ pages: readonly (readonly string[])[] }>
  showBytes(bytes: Uint8Array): Promise<{ pages: readonly (readonly string[])[] }>
  setMarks(marks: readonly PdfMark[]): void
  setLook(look: PdfLook): void
  onUndrawn?(listener: (ids: readonly string[]) => void): void | (() => void)
  scrollToMark(id: string): void
  onSelect(listener: (s: { text: string; fraction: number }) => void): void | (() => void)
}
export type CompileJob = { main: string; sources: readonly { path: string; text: string }[]; files: readonly { path: string; bytes: Uint8Array }[] }
export type CompileResult = { pdf: Uint8Array | null; diagnostics: readonly Diagnostic[]; ms: number } | { failed: 'start' }
export interface CompilerPort { compile(job: CompileJob): Promise<CompileResult> }
export type Failure = { status: number; error: string }
export interface CancelSignal {
  readonly aborted: boolean
  addEventListener(type: 'abort', listener: () => void, options?: { once?: boolean }): void
  removeEventListener(type: 'abort', listener: () => void): void
}
export interface ReviewApi {
  draft(): Promise<{ main: string; files: readonly { file: string; text: string; etag: string }[] }>
  file(path: string): Promise<{ bytes: Uint8Array; text: string | null } | null>
  open(key: string): Promise<{ review: unknown; revision: number; rawReview?: string } | { review: null } | Failure>
  save(key: string, body: string, baseRevision: number, options?: { keepalive?: boolean; signal?: CancelSignal }): Promise<{ revision: number } | Failure>
}
export type Backup = { review: string; pending: { body: string; revision: number } | null; revision: number; saved: boolean; dirty: boolean; at: string }
export interface BackupStore {
  rememberedKey(): string | null
  remember(key: string): void
  read(key: string): Backup | null
  write(key: string, b: Backup): boolean
  keepConflict(key: string, b: Backup): void
  readConflict(key: string): Backup | null
  view(): ViewMode | null
  setView(v: ViewMode): void
  pdfLook(): PdfLook | null
  setPdfLook(look: PdfLook): void
}
export interface CommentDraftStore { read(key: string): string | null; write(key: string, value: string): void; clear(key: string): void }
export interface Clock { now(): string; local?(at: string): string }
export interface Ids { item(): string; key(): string }
export interface Scheduler { after(ms: number, run: () => void): () => void }
export type ReviewLinkView = { url: string; message: string }
export interface PanelPort {
  setUnplaced(items: readonly UnplacedView[]): void
  setCommentDraft(text: string): void
  focusName(): void
  hasCommentDraft(): boolean
  clearCommentDraft(): void
  setLink(view: ReviewLinkView | null): void
  upsertCard(view: CardView): void
  removeCard(id: string): void
  setOrder(ids: readonly string[]): void
  setCount(count: { changes: number; comments: number }): void
  setHead(view: HeadView): void
  setOverallView(text: string): void
  setConflictView(view: { text: string; show: boolean }): void
}
export interface Clipboard { write(text: string): Promise<boolean> }
export type Ports = { draftStore: CommentDraftStore; editor: EditorPort; pdf: PdfPort; api: ReviewApi; store: BackupStore; clock: Clock; ids: Ids; scheduler: Scheduler; clipboard: Clipboard; panel: PanelPort; compiler: CompilerPort | null; reviewable: boolean; hasPdf: boolean; diagnostic(message: string): void }
