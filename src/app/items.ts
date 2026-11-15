import type { ReviewRecord } from '../domain/format/record'
import { DraftReview } from '../domain/review/draft-review'
import type { Change, Target } from '../domain/review/model'
import { placeItems } from '../domain/text/quote'

import { SessionState, type SessionActions } from './session-state'

function brief(text: string): string { return text.replace(/\s+/g, ' ').trim() }

export class SessionItems {
  constructor(private readonly s: SessionState, private readonly actions: Pick<SessionActions, 'changed' | 'editable' | 'head' | 'render'>) {}
  install(record: ReviewRecord): void {
    const placed = placeItems(record.items.filter(i => i.kind === 'overall' || i.file === this.s.file), this.s.draft)
    this.s.record = record; this.s.review = new DraftReview(this.s.file, this.s.draft, placed.placed)
    this.s.overallDraft = record.items.find(item => item.kind === 'overall')?.text ?? ''
    this.s.status = placed.lost ? `${placed.lost} of your earlier items no longer match the draft.` : record.sent ? 'Review sent. Thank you.' : ''
    this.s.ports.editor.setText(this.s.review.applied()); this.actions.render()
  }
  edit(changes: readonly Change[]): void {
    if (!this.actions.editable() || !this.s.review) return
    this.s.review.edit(changes, () => this.s.ports.ids.item(), this.s.ports.clock.now()); this.actions.changed()
  }
  openForm(target: Target, focus = true): void {
    if (!this.actions.editable() || !this.s.review || this.s.ports.panel.hasCommentDraft?.()) return
    let quote: string
    if ('id' in target) {
      const item = this.s.review.items().find(i => i.id === target.id)
      if (!item || item.kind === 'overall') return
      quote = this.s.draft.slice(item.from, item.from + item.quote.exact.length)
    } else quote = this.s.draft.slice(target.from, target.to)
    this.s.form = { target, quote: brief(quote), focus }; this.actions.head()
  }
  cancelForm(): void { this.s.ports.panel.clearCommentDraft?.(); this.s.form = null; this.actions.head() }
  commentOn(target: Target, text: string): void {
    if (!this.actions.editable() || !text.trim()) return
    if ('id' in target && !this.s.review!.items().some(item => item.id === target.id)) {
      this.s.status = 'That item no longer exists. Copy your comment before cancelling.'
      this.actions.head(); return
    }
    this.s.review!.comment(target, text, this.s.ports.ids.item(), this.s.ports.clock.now()); this.s.ports.panel.clearCommentDraft?.(); this.s.form = null; this.actions.changed()
  }
  deleteComment(id: string, index: number): void { if (this.actions.editable()) { this.s.review!.deleteComment(id, index); this.actions.changed() } }
  undoProposal(id: string): void {
    if (this.actions.editable() && this.s.review!.items().some(i => i.id === id && i.kind === 'proposal')) this.s.ports.editor.replace(this.s.review!.undoChange(id))
  }
  focusItem(id: string): void {
    const item = this.s.review?.items().find(i => i.id === id)
    if (item && item.kind !== 'overall') { this.s.ports.editor.scrollTo(this.s.review!.toApplied(item.from)); this.s.ports.pdf.scrollToMark(id) }
  }
  overallText(): string {
    return this.s.overallDraft
  }
  setOverall(text: string): void {
    if (!this.actions.editable() || !this.s.record || text === this.overallText()) return
    this.s.overallDraft = text
    const existing = this.s.record.items.find(item => item.kind === 'overall')
    this.s.record.items = this.s.record.items.filter(item => item.kind !== 'overall')
    if (text.trim()) this.s.record.items.push({ kind: 'overall', id: existing?.id ?? this.s.ports.ids.item(), text, at: this.s.ports.clock.now() })
    this.actions.changed()
  }
}
