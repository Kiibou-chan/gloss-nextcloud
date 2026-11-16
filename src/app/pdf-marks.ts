import { pdfKey } from '../domain/pdf/match'
import { placeItem } from '../domain/pdf/proposal-marks'
import { proposalLabel } from './brief'
import type { Note, Proposal } from '../domain/review/model'
import type { PdfMark } from './ports'
import type { ViewMode } from './view'

import { SessionState, type SessionActions } from './session-state'

export class PdfMarks {
  private cancelPdf: (() => void) | null = null
  private pdfLoading: Promise<void> | null = null
  private pdfScheduledSignature: string | null = null
  private pdfIndex: ReturnType<typeof pdfKey> | null = null
  private pdfCache = new Map<string, { signature: string; marks: PdfMark[] }>()
  constructor(private readonly s: SessionState, private readonly actions: Pick<SessionActions, 'head' | 'render'>) {}
  async setView(view: ViewMode): Promise<void> {
    if (this.s.disposed) return
    if (this.s.ports.hasPdf === false) view = 'editor'
    this.s.view = view; this.s.ports.store.setView(view); this.actions.head(); this.actions.render()
    if (view === 'editor') { this.cancelPdf?.(); this.pdfScheduledSignature = null; return }
    if (!this.pdfLoading) {
      this.s.status = 'Loading the PDF…'; this.actions.head()
      this.pdfLoading = this.s.ports.pdf.show().then(({ pages }) => { this.pdfIndex = pdfKey(pages) })
    }
    try { await this.pdfLoading; if (['Loading the PDF…', 'Could not load the PDF.'].includes(this.s.status)) { this.s.status = ''; this.actions.head() }; this.deferPdf() }
    catch {
      this.pdfLoading = null
      if (this.s.disposed) return
      this.s.view = 'editor'; this.s.ports.store.setView('editor')
      this.s.status = 'Could not load the PDF.'; this.actions.head()
    }
  }
  deferPdf(): void {
    if (this.s.disposed || this.s.view === 'editor' || !this.pdfIndex || !this.s.review) return
    const signature = JSON.stringify(this.s.review.items().map(i => i.kind === 'overall' ? null : [i.id, i.from, i.quote, i.kind === 'proposal' ? i.proposal : '']))
    if (signature === this.pdfScheduledSignature) return
    this.pdfScheduledSignature = signature
    this.cancelPdf?.()
    this.cancelPdf = this.s.ports.scheduler.after(400, () => {
      if (this.s.disposed || this.s.view === 'editor' || !this.pdfIndex || !this.s.review) return
      const next = new Map<string, { signature: string; marks: PdfMark[] }>()
      let changed = false
      const off = new Set<string>()
      for (const item of this.s.review.items()) {
        if (item.kind === 'overall') continue
        const signature = JSON.stringify([item.from, item.quote, item.kind === 'proposal' ? item.proposal : ''])
        const cached = this.pdfCache.get(item.id)
        if (cached?.signature === signature) next.set(item.id, cached)
        else {
          changed = true
          next.set(item.id, { signature, marks: this.place(item) })
        }
        if (next.get(item.id)!.marks.length === 0) off.add(item.id)
      }
      if (changed || next.size !== this.pdfCache.size) this.s.ports.pdf.setMarks([...next.values()].flatMap(c => c.marks))
      this.pdfCache = next
      const same = off.size === this.s.offPdf.size && [...off].every(id => this.s.offPdf.has(id))
      this.s.offPdf = off
      if (!same) this.actions.render()
    })
  }
  private place(item: Proposal | Note): PdfMark[] {
    const source = this.s.source
    if (!source || !this.pdfIndex) return []
    const label = item.kind === 'proposal' ? proposalLabel(item.quote.exact, item.proposal) : null
    const fraction = item.from / Math.max(1, this.s.draft.length)
    const place = placeItem(source, this.pdfIndex, { id: item.id, from: item.from, to: item.from + item.quote.exact.length, inserts: label !== null }, fraction)
    if (!place) return []
    const look = item.kind === 'proposal' ? 'struck' : 'note'
    const marks: PdfMark[] = place.struck.map(p => ({ ...p, look }))
    if (place.caret && label !== null) marks.push({ ...place.caret, look: 'insert', words: label })
    return marks
  }
  dispose(): void { this.cancelPdf?.(); this.cancelPdf = null }
}
