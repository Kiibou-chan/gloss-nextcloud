import type { Ports } from './ports'
import type { Target } from '../domain/review/model'
import { toSource } from '../domain/pdf/match'
import type { ViewMode } from './view'
import { refusal } from './failure'
import { SessionState, type MainDraft, type SessionActions } from './session-state'
import { Lifecycle } from './lifecycle'
import { SessionSave } from './session-save'
import { SessionItems } from './items'
import { Presenter } from './presenter'
import { PdfMarks } from './pdf-marks'
import { LinkKey } from './link-key'

/** Public commands used by the review islands. */
export class ReviewSession {
  private readonly s: SessionState
  private readonly lifecycle: Lifecycle
  private readonly saving: SessionSave
  private readonly items: SessionItems
  private readonly presenter: Presenter
  private readonly pdf: PdfMarks
  private readonly link: LinkKey
  constructor(ports: Ports, page = { address: '', fragment: '' }, main?: MainDraft) {
    this.s = new SessionState(ports, page, main)
    const actions: SessionActions = {
      backup: (...args) => this.saving.backup(...args),
      changed: (...args) => this.saving.changed(...args),
      clearLinkMessage: (...args) => this.link.clearLinkMessage(...args),
      createQueue: (...args) => this.saving.createQueue(...args),
      deferPdf: (...args) => this.pdf.deferPdf(...args),
      editable: (...args) => this.presenter.editable(...args),
      head: (...args) => this.presenter.head(...args),
      install: (...args) => this.items.install(...args),
      keepConflict: (...args) => this.lifecycle.keepConflict(...args),
      overallText: (...args) => this.items.overallText(...args),
      publishLink: (...args) => this.link.publishLink(...args),
      refusal: (failure, prefix) => {
        const message = refusal(failure, prefix)
        if (message.blocks) this.s.blocked = true
        if (failure.status === 403) ports.reviewable = false
        return message.text
      },
      render: (...args) => this.presenter.render(...args),
      setView: (...args) => this.pdf.setView(...args),
    }
    this.lifecycle = new Lifecycle(this.s, actions)
    this.saving = new SessionSave(this.s, actions)
    this.items = new SessionItems(this.s, actions)
    this.presenter = new Presenter(this.s, actions)
    this.pdf = new PdfMarks(this.s, actions)
    this.link = new LinkKey(this.s)
    ports.editor.setEditable(false)
    this.listen(ports.editor.onEdit(changes => this.items.edit(changes)))
    this.listen(ports.editor.onSelect(range => {
      if (!this.presenter.editable() || !this.s.review || range.to <= range.from) return
      const a = this.s.review.fromApplied(range.from), b = this.s.review.fromApplied(range.to)
      const target = 'inside' in a ? { id: a.inside } : 'inside' in b ? { id: b.inside } : this.s.review.targetFor(a.at, b.at)
      this.items.openForm(target, false)
    }))
    this.listen(ports.pdf.onSelect(selection => {
      if (!this.presenter.editable() || !this.s.source || !this.s.review) return
      const range = toSource(this.s.source, selection.text, selection.fraction)
      if (!range) this.s.status = 'That selection could not be placed in the draft. Select a little more, or use the editor.'
      else {
        this.items.openForm(this.s.review.targetFor(range.from, range.to))
        ports.editor.scrollTo(this.s.review.toApplied(range.from))
      }
      this.presenter.head()
    }))
  }
  start(): Promise<void> { return this.lifecycle.start() }
  setName(name: string): Promise<void> { return this.lifecycle.setName(name) }
  pagehide(): void { return this.saving.pagehide() }
  openForm(target: Target, focus = true): void { return this.items.openForm(target, focus) }
  cancelForm(): void { return this.items.cancelForm() }
  commentOn(target: Target, text: string): void { return this.items.commentOn(target, text) }
  deleteComment(id: string, index: number): void { return this.items.deleteComment(id, index) }
  undoProposal(id: string): void { return this.items.undoProposal(id) }
  focusItem(id: string): void { return this.items.focusItem(id) }
  setOverall(text: string): void { return this.items.setOverall(text) }
  setView(view: ViewMode): Promise<void> { return this.pdf.setView(view) }
  copyReviewLink(): Promise<void> { return this.link.copyReviewLink() }
  send(): Promise<void> { return this.saving.send() }
  showKeptChanges(): void { return this.lifecycle.showKeptChanges() }
  private listen(unsubscribe: void | (() => void)): void { if (unsubscribe) this.s.listeners.push(unsubscribe) }
  dispose(): void {
    if (this.s.disposed) return
    this.s.disposed = true; this.s.generation++
    this.saving.dispose(); this.pdf.dispose()
    for (const unsubscribe of this.s.listeners) unsubscribe()
    this.s.listeners = []
  }
  get dirty(): boolean { return this.s.queue?.dirty ?? false }
  online(): void { this.s.queue?.online() }
}
