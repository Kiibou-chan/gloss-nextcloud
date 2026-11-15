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

function brief(text: string): string { return text.replace(/\s+/g, ' ').trim() }

export class ReviewSession {
  private disposed = false
  private listeners: (() => void)[] = []
  private saved = false
  private blocked = false
  private pendingName = ''
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
  private cancelSave: (() => void) | null = null
  private cancelPdf: (() => void) | null = null
  private pdfLoading: Promise<void> | null = null
  private pdfScheduledSignature: string | null = null
  private pdfIndex: ReturnType<typeof pdfKey> | null = null
  private pdfCache = new Map<string, { signature: string; placements: PdfPlacement[] }>()
  private source: ReturnType<typeof sourceKey> | null = null
  private ops: ReturnType<typeof plainOps> = []
  private pending: Promise<void> | null = null

  // F3: the page address is supplied by the browser wiring.
  private linkMessage = ''
  constructor(private readonly ports: Ports, private readonly page: { address: string; fragment: string } = { address: '', fragment: '' }) {
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
    this.cancelSave?.(); this.cancelPdf?.()
    this.cancelSave = this.cancelPdf = null
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
      const fragment = /^#[A-Za-z0-9]{16}$/.test(this.page.fragment) ? this.page.fragment.slice(1) : null
      const remembered = fragment ?? this.ports.store.rememberedKey()
      if (remembered && /^[A-Za-z0-9]{16}$/.test(remembered)) {
        this.key = remembered
        const backup = this.ports.store.read(remembered)
        this.saved = backup?.saved === true
        if (fragment || this.saved) await this.loadReview('', backup)
        else if (backup) this.restore(backup)
      }
    } catch { this.status = 'Could not load the draft.'; this.head() }
  }

  async setName(name: string): Promise<void> {
    if (this.disposed || !this.ports.reviewable || this.blocked || !this.review || this.record?.sent) return
    name = name.trim()
    if (name === this.record?.name) return
    if ([...name].length > 100) {
      this.status = 'Your name must be 100 characters or fewer.'
      this.head(); return
    }
    if (this.record) {
      if (!name) return
      this.record.name = name; this.changed(); return
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
      this.ports.store.remember(this.key); this.backup(false)
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
        if (name) this.install(this.emptyRecord(name))
      } else {
        this.saved = true
        const result = readReview(opened.review, () => this.ports.ids.item())
        if ('error' in result) { this.status = result.error; return }
        if ('revision' in opened) result.record.revision = opened.revision
        this.install(result.record)
      }
      this.ports.store.remember(this.key)
    } catch { if (generation === this.generation) this.status = 'Could not load your review.' }
    finally { if (generation === this.generation) { this.loading = false; this.render() } }
  }
  // Interim S7 saving path; F2 owns timed backups and pending saves.
  private backup(dirty: boolean): void {
    if (!this.record || !this.review || !this.key) return
    this.ports.store.write(this.key, {
      review: writeReview({ ...this.record, revision: Math.max(1, this.record.revision), items: [...this.review.items(), ...this.record.items.filter(i => i.kind === 'overall')] }),
      revision: this.record.revision, saved: this.saved, dirty, pending: null, at: this.ports.clock.now(),
    })
  }
  private refusal(failure: Failure, prefix: string): string {
    if ([403, 404, 410].includes(failure.status)) this.blocked = true
    if (failure.status === 403) return 'This link is not set up for reviewing.'
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

  // F3: link visibility follows a confirmed server save or open.
  private reviewLink(): string | null {
    return this.saved && this.key && this.page.address ? `${this.page.address.split('#')[0]}#${this.key}` : null
  }
  private publishLink(): void {
    const url = this.reviewLink()
    this.ports.panel.setLink?.(url ? { url, message: this.linkMessage } : null)
  }
  async copyReviewLink(): Promise<void> {
    const url = this.reviewLink()
    if (this.disposed || !url) return
    let copied = false
    try { copied = await this.ports.clipboard.write(url) } catch { /* A denied clipboard remains selectable. */ }
    if (this.disposed) return
    this.linkMessage = copied ? 'Link copied.' : 'Copy failed; select the link and copy it.'
    this.publishLink()
  }

  private editable(): boolean { return !this.disposed && !this.blocked && this.ports.reviewable && !!this.record && !this.record.sent && !this.loading }
  private head(): void {
    if (this.disposed) return
    const editable = this.editable()
    this.publishLink()
    this.ports.editor.setEditable(editable)
    const countText = `${this.count.changes} ${this.count.changes === 1 ? 'change' : 'changes'}, ${this.count.comments} ${this.count.comments === 1 ? 'comment' : 'comments'}`
    this.ports.panel.setOverallView?.(this.overallText())
    this.ports.panel.setHead({ reviewable: this.ports.reviewable, name: this.record?.name ?? this.pendingName, title: this.file, hasPdf: this.ports.hasPdf !== false, view: this.view, editable, canSend: editable && (this.order.length > 0 || !!this.overallText().trim()), status: this.status, countText, form: this.form })
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
    this.record.updatedAt = this.ports.clock.now(); this.status = 'Saving…'; this.backup(true); this.render()
    this.cancelSave?.(); this.cancelSave = this.ports.scheduler.after(600, () => { this.cancelSave = null; void this.save() })
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
  private async save(): Promise<void> {
    if (this.disposed || !this.ports.reviewable || this.blocked) return
    if (this.pending) { await this.pending; return this.save() }
    if (!this.record || !this.review || !this.key) return
    const record = this.record, review = this.review, key = this.key
    const actual = this.ports.editor.text()
    if (actual !== review.applied()) {
      review.rebuild(actual, () => this.ports.ids.item(), this.ports.clock.now())
      this.ports.diagnostic?.('The editor and review differed; the review was rebuilt.')
      this.render()
    }
    const savingSent = record.sent
    const body = writeReview({ ...record, revision: record.revision + 1, draft: { file: this.file, etag: this.etag }, items: [...review.items(), ...record.items.filter(i => i.kind === 'overall')] })
    let bytes = 0
    for (const character of body) {
      const point = character.codePointAt(0)!
      bytes += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4
    }
    const task = async () => {
      try {
        const result = bytes > 1_048_576 ? await Promise.resolve({ status: 413, error: 'tooLarge' }) : await this.ports.api.save(key, body, record.revision)
        if ('status' in result) {
          if (savingSent) { record.sent = false; record.sentAt = null; this.status = this.refusal(result, 'Not sent: ') }
          else this.status = this.refusal(result, 'Not saved: ')
        } else { record.revision = result.revision; this.saved = true; this.backup(false); this.status = savingSent ? 'Review sent. Thank you.' : record.sent ? 'Sending…' : 'Saved' }
      } catch {
        this.status = savingSent ? 'Not sent: network' : 'Not saved: network'
        if (savingSent) { record.sent = false; record.sentAt = null }
      } finally { this.pending = null; if (record === this.record) this.render() }
    }
    this.pending = task(); await this.pending
  }
  async send(): Promise<void> {
    if (!this.editable() || (!this.review?.items().length && !this.overallText().trim())) return
    this.cancelSave?.(); this.cancelSave = null
    this.record!.sent = true; this.record!.sentAt = this.ports.clock.now(); this.record!.updatedAt = this.record!.sentAt
    this.form = null; this.status = 'Sending…'; this.render(); await this.save()
  }
  /** Reserved feature seams, settled by the S7 coordinator ruling. */
  private overallText(): string {
    return this.record?.items.find(item => item.kind === 'overall')?.text ?? ''
  }
  setOverall(text: string): void {
    if (!this.editable() || !this.record || text === this.overallText()) return
    const existing = this.record.items.find(item => item.kind === 'overall')
    this.record.items = this.record.items.filter(item => item.kind !== 'overall')
    if (text.trim()) this.record.items.push({ kind: 'overall', id: existing?.id ?? this.ports.ids.item(), text, at: this.ports.clock.now() })
    this.changed()
  }
  showKeptChanges(): void { this.ports.panel.setConflictView?.() }
}
