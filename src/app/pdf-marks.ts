import { pdfKey, placeMarks } from '../domain/pdf/match'
import type { PdfPlacement } from '../domain/pdf/match'
import { shown } from '../domain/source/shown'
import type { ViewMode } from './view'

import { SessionState, type SessionActions } from './session-state'

export class PdfMarks {
  private cancelPdf: (() => void) | null = null
  private pdfLoading: Promise<void> | null = null
  private pdfScheduledSignature: string | null = null
  private pdfIndex: ReturnType<typeof pdfKey> | null = null
  private pdfCache = new Map<string, { signature: string; placements: PdfPlacement[] }>()
  constructor(private readonly s: SessionState, private readonly actions: Pick<SessionActions, 'head'>) {}
  async setView(view: ViewMode): Promise<void> {
    if (this.s.disposed) return
    if (this.s.ports.hasPdf === false) view = 'editor'
    this.s.view = view; this.s.ports.store.setView(view); this.actions.head()
    if (view === 'editor') { this.cancelPdf?.(); this.pdfScheduledSignature = null; return }
    this.pdfLoading ??= this.s.ports.pdf.show().then(({ pages }) => { this.pdfIndex = pdfKey(pages) })
    try { await this.pdfLoading; if (this.s.status === 'Could not load the PDF.') { this.s.status = ''; this.actions.head() }; this.deferPdf() }
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
      const next = new Map<string, { signature: string; placements: PdfPlacement[] }>()
      let changed = false
      for (const item of this.s.review.items()) {
        if (item.kind === 'overall') continue
        const signature = JSON.stringify([item.from, item.quote, item.kind === 'proposal' ? item.proposal : ''])
        const cached = this.pdfCache.get(item.id)
        if (cached?.signature === signature) next.set(item.id, cached)
        else {
          changed = true
          const text = shown(this.s.draft, this.s.ops, item.from, item.from + item.quote.exact.length)
          next.set(item.id, { signature, placements: placeMarks(this.pdfIndex, [{ id: item.id, shown: text, fraction: item.from / Math.max(1, this.s.draft.length) }]) })
        }
      }
      if (changed || next.size !== this.pdfCache.size) this.s.ports.pdf.setMarks([...next.values()].flatMap(c => c.placements))
      this.pdfCache = next
    })
  }
  dispose(): void { this.cancelPdf?.(); this.cancelPdf = null }
}
