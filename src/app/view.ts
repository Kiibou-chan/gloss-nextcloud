import type { Comment, Target } from '../domain/review/model'
export type ViewMode = 'editor' | 'pdf' | 'both'
export type EditorMark = { id: string; from: number; to: number }
export type DeletedWords = { id: string; at: number; text: string }
export type CardView = { id: string; kind: 'proposal' | 'comment'; from: number; shown: string; proposalShown: string; comments: readonly Comment[]; editable: boolean }
export type HeadView = { name: string; title: string; hasPdf: boolean; view: ViewMode; editable: boolean; canSend: boolean; status: string; countText: string; form: { target: Target; focus: boolean } | null }
