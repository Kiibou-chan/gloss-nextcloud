import type { Quote } from '../text/quote'

export type NewId = () => string
export type Comment = { text: string; at: string }
type Anchored = { id: string; file: string; from: number; quote: Quote; comments: Comment[]; at: string }
export type Proposal = Anchored & { kind: 'proposal'; proposal: string }
export type Note = Anchored & { kind: 'comment' }
export type Overall = { id: string; kind: 'overall'; text: string; at: string }
export type Item = Proposal | Note | Overall
/** Replacements in the editor text before a transaction. */
export type Change = { from: number; to: number; insert: string }
/** Comment targets use draft coordinates. */
export type Target = { id: string } | { from: number; to: number }
