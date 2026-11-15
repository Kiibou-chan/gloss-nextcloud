import { readReview } from '../domain/format/read'
import type { ReviewRecord } from '../domain/format/record'
import { writeReview } from '../domain/format/write'
import { pdfKey, placeMarks, sourceKey, toSource } from '../domain/pdf/match'
import type { PdfPlacement } from '../domain/pdf/match'
import { DraftReview } from '../domain/review/draft-review'
import type { Change, Target } from '../domain/review/model'
import { languageOf } from '../domain/source/language'
import { shown } from '../domain/source/shown'
import { parseTypst, plainOps } from '../domain/source/typst-parse'
import { placeItems } from '../domain/text/quote'
import type { Backup, Failure, Ports } from './ports'
import type { CardView, HeadView, ViewMode } from './view'
import { SaveQueue } from './save-queue'

function brief(text: string): string { return text.replace(/\s+/g, ' ').trim() }

export class ReviewSession {
  private disposed = false
  private listeners: (() => void)[] = []
  private saved = false
  private blocked = false
  private pendingName = ''
  private blankName = false
  private draft = ''
  private file = ''
  private etag = ''
  private review: DraftReview | null = null
  private record: ReviewRecord | null = null
  private key = ''
  private status = ''
  private form: HeadView['form'] = null
  private view: ViewMode = 'editor'
  private loading = false
  private generation = 0
  private cards = new Map<string, string>()
  private order: string[] = []
  private count = { changes: 0, comments: 0 }
  private queue: SaveQueue | null = null
  private cancelBackup: (() => void) | null = null
  private backupFailed = false
  private conflictText: string | null = null
  private cancelPdf: (() => void) | null = null
  private pdfLoading: Promise<void> | null = null
  private pdfScheduledSignature: string | null = null
  private pdfIndex: ReturnType<typeof pdfKey> | null = null
  private pdfCache = new Map<string, { signature: string; placements: PdfPlacement[] }>()
  private source: ReturnType<typeof sourceKey> | null = null
  private ops: ReturnType<typeof plainOps> = []

  constructor(private readonly ports: Ports) {
    ports.editor.setEditable(false)
    this.listen(ports.editor.onEdit(changes => this.edit(changes)))
    this.listen(ports.editor.onSelect(range => {
      if (!this.editable() || !this.review || range.to <= range.from) return
      const a = this.review.fromApplied(range.from), b = this.review.fromApplied(range.to)
      const target = 'inside' in a ? { id: a.inside } : 'inside' in b ? { id: b.inside } : this.review.targetFor(a.at, b.at)
      this.openForm(target, false)
    }))
    this.listen(ports.pdf.onSelect(selection => {
      if (!this.editable() || !this.source || !this.review) return
      const range = toSource(this.source, selection.text, selection.fraction)
      if (!range) this.status = 'That selection could not be placed in the draft. Select a little more, or use the editor.'
      else {
        this.openForm(this.review.targetFor(range.from, range.to))
        ports.editor.scrollTo(this.review.toApplied(range.from))
      }
      this.head()
    }))
  }

  private listen(unsubscribe: void | (() => void)): void {
    if (unsubscribe) this.listeners.push(unsubscribe)
  }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true; this.generation++
    this.queue?.dispose(); this.cancelBackup?.(); this.cancelPdf?.()
    this.cancelBackup = this.cancelPdf = null
    for (const unsubscribe of this.listeners) unsubscribe()
    this.listeners = []
  }
  async start(): Promise<void> {
    try {
      const d = await this.ports.api.draft()
      if (this.disposed) return
      const main = d.files.find(f => f.file === d.main)
      if (!main) { this.status = 'The draft could not be found.'; this.head(); return }
      this.file = main.file; this.draft = main.text; this.etag = main.etag
      this.ops = languageOf(this.file) === 'typst' ? parseTypst(this.draft) : plainOps(this.draft)
      this.source = sourceKey(this.file, this.draft, this.ops)
      this.review = new DraftReview(this.file, this.draft)
      this.ports.editor.setText(this.review.applied()); this.render()
      await this.setView(this.ports.store.view() ?? 'editor')
      if (!this.ports.reviewable) { this.status = 'This link is not set up for reviewing.'; this.head(); return }
      const remembered = this.ports.store.rememberedKey()
      if (remembered && /^[A-Za-z0-9]{16}$/.test(remembered)) {
        this.key = remembered
        const backup = this.ports.store.read(remembered)
        this.saved = backup?.saved === true
        if (this.saved) await this.loadReview('', backup)
        else if (backup) { this.restore(backup); this.createQueue(backup); if (backup.pending) await this.queue?.flush() }
      }
    } catch { this.status = 'Could not load the draft.'; this.head() }
  }

  async setName(name: string): Promise<void> {
    if (this.disposed || !this.ports.reviewable || this.blocked || !this.review || this.record?.sent) return
    name = name.trim()
    if (name === this.record?.name && !this.blankName) return
    if ([...name].length > 100) {
      this.status = 'Your name must be 100 characters or fewer.'
      this.head(); return
    }
    if (this.record) {
      this.blankName = !name
      if (name) this.record.name = name
      this.changed(); return
    }
    this.pendingName = name
    if (!name) { this.render(); return }
    if (!this.key) {
      const remembered = this.ports.store.rememberedKey()
      this.key = remembered && /^[A-Za-z0-9]{16}$/.test(remembered) ? remembered : this.ports.ids.key()
      this.saved = !!remembered && /^[A-Za-z0-9]{16}$/.test(remembered) && this.ports.store.read(this.key)?.saved === true
    }
    if (this.saved) await this.loadReview(name, this.ports.store.read(this.key))
    else {
      this.install(this.emptyRecord(name))
      this.ports.store.remember(this.key); this.createQueue(); this.backup(false)
    }
  }

  private emptyRecord(name: string): ReviewRecord {
    return { revision: 0, name, draft: { file: this.file, etag: this.etag }, sent: false, sentAt: null, updatedAt: this.ports.clock.now(), items: [] }
  }
  private install(record: ReviewRecord): void {
    const placed = placeItems(record.items.filter(i => i.kind === 'overall' || i.file === this.file), this.draft)
    this.record = record; this.review = new DraftReview(this.file, this.draft, placed.placed)
    this.status = placed.lost ? `${placed.lost} of your earlier items no longer match the draft.` : record.sent ? 'Review sent. Thank you.' : ''
    this.ports.editor.setText(this.review.applied()); this.render()
  }
  private restore(backup: Backup): void {
    let json: unknown
    try { json = JSON.parse(backup.review) } catch { return }
    const result = readReview(json, () => this.ports.ids.item())
    if ('error' in result) { this.status = result.error; this.head(); return }
    result.record.revision = backup.revision
    this.install(result.record)
  }
  private async loadReview(name: string, backup: Backup | null): Promise<void> {
    const generation = ++this.generation
    this.loading = true; this.render()
    try {
      const opened = await this.ports.api.open(this.key)
      if (this.disposed || generation !== this.generation) return
      if ('status' in opened) { this.status = this.refusal(opened, 'Could not load your review: '); return }
      if (opened.review === null) {
        this.saved = false
        if (!name && backup) {
          try { const result = readReview(JSON.parse(backup.review), () => this.ports.ids.item()); if (!('error' in result)) name = result.record.name } catch { /* An invalid backup cannot supply a name. */ }
        }
        this.install(this.emptyRecord(name))
      } else {
        const result = readReview(opened.review, () => this.ports.ids.item())
        if ('error' in result) { this.status = result.error; return }
        if ('revision' in opened) result.record.revision = opened.revision
        this.install(result.record)
      }
      if (backup?.dirty) {
        const serverRevision = this.record?.revision ?? 0
        let pendingRevision: number | null = null
        try { pendingRevision = backup.pending ? JSON.parse(backup.pending.body).revision : null } catch { /* Invalid pending data cannot match. */ }
        if (backup.revision === serverRevision || pendingRevision === serverRevision) this.restore(backup)
        else {
          this.ports.store.keepConflict(this.key, backup)
          this.conflictText = this.keptText(backup)
          this.ports.panel.setConflictView?.({ text: this.conflictText, show: false })
          this.status = `Changes made in this browser at ${backup.at} were not restored, as the review changed elsewhere.`
          backup = null
        }
      }
      this.createQueue(backup?.dirty ? backup : null)
      this.ports.store.remember(this.key)
      if (backup?.dirty && backup.pending) await this.queue?.flush()
      else if (!backup?.dirty && this.record && !this.status) this.status = 'Saved'
    } catch { if (generation === this.generation) this.status = 'Could not load your review.' }
    finally { if (generation === this.generation) { this.loading = false; this.render() } }
  }
  private serialise(revision: number): string | null {
    if (!this.record || !this.review) return null
    return writeReview({ ...this.record, revision: Math.max(1, revision), draft: { file: this.file, etag: this.etag }, items: [...this.review.items(), ...this.record.items.filter(i => i.kind === 'overall')] })
  }
  private body(revision: number): string | null {
    if (this.blankName || !this.record?.name || !this.review || this.blocked) return null
    const actual = this.ports.editor.text()
    if (actual !== this.review.applied()) {
      this.review.rebuild(actual, () => this.ports.ids.item(), this.ports.clock.now())
      this.ports.diagnostic?.('The editor and review differed; the review was rebuilt.')
      this.render()
    }
    return this.serialise(revision)
  }
  private createQueue(backup: Backup | null = null): void {
    this.queue?.dispose()
    this.queue = new SaveQueue({
      enabled: () => !this.blankName && !this.blocked,
      scheduler: this.ports.scheduler, revision: backup?.revision ?? this.record?.revision ?? 0,
      pending: backup?.pending, dirty: backup?.dirty ?? false,
      body: revision => this.body(revision),
      save: (body, base, options) => options ? this.ports.api.save(this.key, body, base, options) : this.ports.api.save(this.key, body, base),
      onStatus: (status, outcome) => {
        if (outcome && 'status' in outcome && ![0, 423].includes(outcome.status) && outcome.status < 500) {
          if (this.record?.sent) { this.record.sent = false; this.record.sentAt = null }
          this.status = outcome.status === 412 ? status : this.refusal(outcome, 'Not saved: ')
          if (outcome.status === 409 && outcome.error === 'conflict') {
            this.backup(true)
            const backup = this.ports.store.read(this.key)
            if (backup) {
              this.ports.store.keepConflict(this.key, backup)
              this.conflictText = this.keptText(backup)
              this.ports.panel.setConflictView?.({ text: this.conflictText, show: false })
            }
          }
        } else {
          if (outcome && 'revision' in outcome && this.record) {
            this.record.revision = outcome.revision; this.saved = true
          }
          this.status = status === 'Saved' && this.record?.sent ? 'Sending…' : status
        }
        this.render()
      },
      onChange: () => { this.backup(this.queue?.dirty ?? true); this.head() },
    })
  }
  private backup(dirty: boolean): void {
    const review = this.serialise(this.record?.revision ?? 0)
    if (!review || !this.key || !this.record) return
    this.backupFailed = !this.ports.store.write(this.key, {
      review, revision: this.queue?.revision ?? this.record.revision, saved: this.saved, dirty,
      pending: this.queue?.pending ?? null, at: this.ports.clock.now(),
    })
  }
  get dirty(): boolean { return this.queue?.dirty ?? false }
  online(): void { this.queue?.online() }
  pagehide(): void {
    this.cancelBackup?.(); this.cancelBackup = null
    this.backup(this.dirty)
    this.queue?.pagehide()
    this.backup(this.dirty)
  }
  private keptText(backup: Backup): string {
    try {
      const result = readReview(JSON.parse(backup.review), () => this.ports.ids.item())
      if ('error' in result) return backup.review
      return result.record.items.map(item => item.kind === 'overall' ? item.text : [item.quote.exact, ...(item.kind === 'proposal' ? [item.proposal] : []), ...item.comments.map(c => c.text)].join('\n')).join('\n\n')
    } catch { return backup.review }
  }
  private refusal(failure: Failure, prefix: string): string {
    if ([403, 404, 410].includes(failure.status)) this.blocked = true
    if (failure.status === 403) { this.ports.reviewable = false; return 'This link is not set up for reviewing.' }
    if (failure.status === 404 || failure.status === 410) return 'This review link no longer works. Your changes are kept in this browser.'
    if (failure.status === 429) return 'The server is refusing saves for now. Your changes are kept in this browser; reload the page later to try again.'
    if (failure.status === 413) return 'Your review is over 1 MB and cannot be saved; shorten some comments.'
    if (failure.status === 409) {
      if (failure.error === 'conflict') return 'Your review was changed in another window or on another device. Reload the page to continue.'
      if (failure.error === 'sent') return 'This review has already been sent.'
      if (failure.error === 'full') return 'This link has reached its limit of 50 reviews. Please write to the person who sent you the link.'
      if (failure.error === 'reviewsBlocked') return 'The reviews folder is blocked by a file. Please write to the person who sent you the link.'
    }
    return prefix + failure.error
  }

  private editable(): boolean { return !this.disposed && !this.blocked && this.ports.reviewable && !this.blankName && !!this.record?.name && !this.record.sent && !this.loading }
  private head(): void {
    if (this.disposed) return
    const editable = this.editable()
    this.ports.editor.setEditable(editable)
    const countText = `${this.count.changes} ${this.count.changes === 1 ? 'change' : 'changes'}, ${this.count.comments} ${this.count.comments === 1 ? 'comment' : 'comments'}`
    this.ports.panel.setHead({ reviewable: this.ports.reviewable, name: this.blankName ? '' : this.record?.name ?? this.pendingName, title: this.file, hasPdf: this.ports.hasPdf !== false, view: this.view, editable, canSend: editable && this.order.length > 0, status: this.status + (this.backupFailed ? ' Not backed up in this browser.' : ''), countText, form: this.form })
  }

  private render(): void {
    if (this.disposed) return
    if (!this.review) { this.head(); return }
    const next = new Map<string, string>(), ids: string[] = []
    const marks = [], deleted = []
    let changes = 0, comments = 0
    for (const item of [...this.review.items()].sort((a, b) => ('from' in a ? a.from : 0) - ('from' in b ? b.from : 0))) {
      if (item.kind === 'overall') continue
      const from = this.review.toApplied(item.from), to = this.review.toApplied(item.from + item.quote.exact.length)
      const card: CardView = { id: item.id, kind: item.kind, from: item.from, shown: brief(this.draft.slice(item.from, item.from + item.quote.exact.length)), proposalShown: item.kind === 'proposal' ? brief(item.proposal) : '', comments: item.comments.map(c => ({ ...c })), editable: this.editable() }
      const signature = JSON.stringify(card)
      if (this.cards.get(item.id) !== signature) this.ports.panel.upsertCard(card)
      next.set(item.id, signature); ids.push(item.id)
      if (item.kind === 'proposal') {
        changes++; marks.push({ id: item.id, from, to: from + item.proposal.length }); deleted.push({ id: item.id, at: from, text: item.quote.exact })
      } else { comments++; marks.push({ id: item.id, from, to }) }
    }
    for (const id of this.cards.keys()) if (!next.has(id)) this.ports.panel.removeCard(id)
    this.cards = next
    if (JSON.stringify(ids) !== JSON.stringify(this.order)) { this.order = ids; this.ports.panel.setOrder(ids) }
    if (changes !== this.count.changes || comments !== this.count.comments) { this.count = { changes, comments }; this.ports.panel.setCount(this.count) }
    this.ports.editor.setMarks(marks, deleted); this.head(); this.deferPdf()
  }

  private edit(changes: readonly Change[]): void {
    if (!this.editable() || !this.review) return
    this.review.edit(changes, () => this.ports.ids.item(), this.ports.clock.now()); this.changed()
  }
  private changed(): void {
    if (!this.record) return
    this.record.updatedAt = this.ports.clock.now(); this.status = 'Saving…'; this.queue?.changed(); this.render()
    this.cancelBackup?.(); this.cancelBackup = this.ports.scheduler.after(300, () => { this.cancelBackup = null; this.backup(this.dirty); this.head() })
  }
  openForm(target: Target, focus = true): void {
    if (!this.editable() || !this.review) return
    let quote: string
    if ('id' in target) {
      const item = this.review.items().find(i => i.id === target.id)
      if (!item || item.kind === 'overall') return
      quote = this.draft.slice(item.from, item.from + item.quote.exact.length)
    } else quote = this.draft.slice(target.from, target.to)
    this.form = { target, quote: brief(quote), focus }; this.head()
  }
  cancelForm(): void { this.form = null; this.head() }
  commentOn(target: Target, text: string): void {
    if (!this.editable() || !text.trim()) return
    if ('id' in target && !this.review!.items().some(item => item.id === target.id)) {
      this.form = null
      this.status = 'That item no longer exists, so the comment form has been closed.'
      this.head(); return
    }
    this.review!.comment(target, text, this.ports.ids.item(), this.ports.clock.now()); this.form = null; this.changed()
  }
  deleteComment(id: string, index: number): void { if (this.editable()) { this.review!.deleteComment(id, index); this.changed() } }
  undoProposal(id: string): void {
    if (this.editable() && this.review!.items().some(i => i.id === id && i.kind === 'proposal')) this.ports.editor.replace(this.review!.undoChange(id))
  }
  focusItem(id: string): void {
    const item = this.review?.items().find(i => i.id === id)
    if (item && item.kind !== 'overall') { this.ports.editor.scrollTo(this.review!.toApplied(item.from)); this.ports.pdf.scrollToMark(id) }
  }
  async setView(view: ViewMode): Promise<void> {
    if (this.disposed) return
    if (this.ports.hasPdf === false) view = 'editor'
    this.view = view; this.ports.store.setView(view); this.head()
    if (view === 'editor') { this.cancelPdf?.(); this.pdfScheduledSignature = null; return }
    this.pdfLoading ??= this.ports.pdf.show().then(({ pages }) => { this.pdfIndex = pdfKey(pages) })
    try { await this.pdfLoading; if (this.status === 'Could not load the PDF.') { this.status = ''; this.head() }; this.deferPdf() }
    catch {
      this.pdfLoading = null
      if (this.disposed) return
      this.view = 'editor'; this.ports.store.setView('editor')
      this.status = 'Could not load the PDF.'; this.head()
    }
  }
  private deferPdf(): void {
    if (this.disposed || this.view === 'editor' || !this.pdfIndex || !this.review) return
    const signature = JSON.stringify(this.review.items().map(i => i.kind === 'overall' ? null : [i.id, i.from, i.quote, i.kind === 'proposal' ? i.proposal : '']))
    if (signature === this.pdfScheduledSignature) return
    this.pdfScheduledSignature = signature
    this.cancelPdf?.()
    this.cancelPdf = this.ports.scheduler.after(400, () => {
      if (this.disposed || this.view === 'editor' || !this.pdfIndex || !this.review) return
      const next = new Map<string, { signature: string; placements: PdfPlacement[] }>()
      let changed = false
      for (const item of this.review.items()) {
        if (item.kind === 'overall') continue
        const signature = JSON.stringify([item.from, item.quote, item.kind === 'proposal' ? item.proposal : ''])
        const cached = this.pdfCache.get(item.id)
        if (cached?.signature === signature) next.set(item.id, cached)
        else {
          changed = true
          const text = shown(this.draft, this.ops, item.from, item.from + item.quote.exact.length)
          next.set(item.id, { signature, placements: placeMarks(this.pdfIndex, [{ id: item.id, shown: text, fraction: item.from / Math.max(1, this.draft.length) }]) })
        }
      }
      if (changed || next.size !== this.pdfCache.size) this.ports.pdf.setMarks([...next.values()].flatMap(c => c.placements))
      this.pdfCache = next
    })
  }
  async send(): Promise<void> {
    if (!this.editable() || !this.review?.items().length) return
    this.record!.sent = true; this.record!.sentAt = this.ports.clock.now(); this.record!.updatedAt = this.record!.sentAt
    this.form = null; this.status = 'Sending…'; this.queue?.changed(); this.render()
    await this.queue?.flush()
  }
  /** Reserved feature seams, settled by the S7 coordinator ruling. */
  setOverall(text: string): void { this.ports.panel.setOverallView?.(text) }
  showKeptChanges(): void {
    const backup = this.ports.store.readConflict(this.key)
    const text = this.conflictText ?? (backup ? this.keptText(backup) : '')
    this.ports.panel.setConflictView?.({ text, show: true })
  }
}
