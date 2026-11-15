import type { PdfPlacement } from '../domain/pdf/match'
import type { Change } from '../domain/review/model'
import type { CardView, DeletedWords, EditorMark, HeadView, ViewMode } from './view'
export type { Change } from '../domain/review/model'
export interface EditorPort {
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
export interface PdfPort {
  dispose?(): void
  show(): Promise<{ pages: readonly (readonly string[])[] }>
  setMarks(placements: readonly PdfPlacement[]): void
  scrollToMark(id: string): void
  onSelect(listener: (s: { text: string; fraction: number }) => void): void | (() => void)
}
export type Failure = { status: number; error: string }
export interface ReviewApi {
  draft(): Promise<{ main: string; files: readonly { file: string; text: string; etag: string }[] }>
  open(key: string): Promise<{ review: unknown; revision: number } | { review: null } | Failure>
  save(key: string, body: string, baseRevision: number): Promise<{ revision: number } | Failure>
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
}
export interface Clock { now(): string }
export interface Ids { item(): string; key(): string }
export interface Scheduler { after(ms: number, run: () => void): () => void }
export interface PanelPort {
  upsertCard(view: CardView): void
  removeCard(id: string): void
  setOrder(ids: readonly string[]): void
  setCount(count: { changes: number; comments: number }): void
  setHead(view: HeadView): void
  setOverallView?(text: string): void
  setConflictView?(): void
}
export interface Clipboard { write(text: string): Promise<boolean> }
export type Ports = { editor: EditorPort; pdf: PdfPort; api: ReviewApi; store: BackupStore; clock: Clock; ids: Ids; scheduler: Scheduler; clipboard: Clipboard; panel: PanelPort; reviewable: boolean; hasPdf?: boolean; diagnostic?(message: string): void }
