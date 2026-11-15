import { shown } from '../domain/source/shown'
import type { CardView } from './view'

import { SessionState, type SessionActions } from './session-state'

function brief(text: string): string { return text.replace(/\s+/g, ' ').trim() }

export class Presenter {
  private cards = new Map<string, string>()
  private order: string[] = []
  private count = { changes: 0, comments: 0 }
  constructor(private readonly s: SessionState, private readonly actions: Pick<SessionActions, 'deferPdf' | 'overallText' | 'publishLink'>) {}
  editable(): boolean { return !this.s.disposed && !this.s.blocked && this.s.ports.reviewable && !this.s.blankName && !!this.s.record?.name && !this.s.record.sent && !this.s.loading }
  head(): void {
    if (this.s.disposed) return
    const editable = this.editable()
    this.actions.publishLink()
    this.s.ports.editor.setEditable(editable)
    this.s.ports.panel.setOverallView(this.actions.overallText())
    const status = this.s.blankName && ['', 'Saving…', 'Saved'].includes(this.s.status) ? 'Enter your name to continue.' : this.s.status || (this.s.ports.reviewable && !this.s.record && !this.s.loading ? 'Enter your name to start.' : '')
    this.s.ports.panel.setHead({ sent: this.s.record?.sent ?? false, reviewable: this.s.ports.reviewable, name: this.s.blankName ? '' : this.s.record?.name ?? this.s.pendingName, title: this.s.file, hasPdf: this.s.ports.hasPdf !== false, view: this.s.view, editable, canSend: editable && (this.order.length > 0 || !!this.actions.overallText().trim()), status: status + (this.s.backupFailed ? ' Not backed up in this browser.' : ''), form: this.s.form })
  }
  render(): void {
    if (this.s.disposed) return
    if (!this.s.review) { this.head(); return }
    const next = new Map<string, string>(), ids: string[] = []
    const marks = [], deleted = []
    let changes = 0, comments = 0
    for (const item of [...this.s.review.items()].sort((a, b) => ('from' in a ? a.from : 0) - ('from' in b ? b.from : 0))) {
      if (item.kind === 'overall') continue
      const from = this.s.review.toApplied(item.from), to = this.s.review.toApplied(item.from + item.quote.exact.length)
      const card: CardView = { id: item.id, kind: item.kind, from: item.from, shown: brief(this.s.draft.slice(item.from, item.from + item.quote.exact.length)), proposalShown: item.kind === 'proposal' ? brief(item.proposal) : '', comments: item.comments.map(c => ({ ...c })), editable: this.editable() }
      const signature = JSON.stringify(card)
      if (this.cards.get(item.id) !== signature) this.s.ports.panel.upsertCard(card)
      next.set(item.id, signature); ids.push(item.id)
      if (item.kind === 'proposal') {
        changes++; marks.push({ id: item.id, from, to: from + item.proposal.length }); deleted.push({ id: item.id, at: from, text: item.quote.exact })
      } else { comments++; marks.push({ id: item.id, from, to }) }
    }
    for (const id of this.cards.keys()) if (!next.has(id)) this.s.ports.panel.removeCard(id)
    this.cards = next
    if (JSON.stringify(ids) !== JSON.stringify(this.order)) { this.order = ids; this.s.ports.panel.setOrder(ids) }
    if (changes !== this.count.changes || comments !== this.count.comments) { this.count = { changes, comments }; this.s.ports.panel.setCount(this.count) }
    this.s.ports.editor.setMarks(marks, deleted); this.head(); this.actions.deferPdf()
  }
}
