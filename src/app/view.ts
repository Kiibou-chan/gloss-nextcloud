import type { Comment, Target } from '../domain/review/model'
export type ViewMode = 'editor' | 'pdf' | 'both'
export type EditorMark = { id: string; from: number; to: number }
export type DeletedWords = { id: string; at: number; text: string }
/** Raw source and proposal text with normalised whitespace; the panel renders "(line break)" when both are empty. */
export type CardView = { id: string; kind: 'proposal' | 'comment'; from: number; shown: string; proposalShown: string; comments: readonly Comment[]; editable: boolean }
export type HeadView = { sent?: boolean; reviewable?: boolean; name: string; title: string; hasPdf: boolean; view: ViewMode; editable: boolean; canSend: boolean; status: string; form: { target: Target; quote: string; focus: boolean } | null }
