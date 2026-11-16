import { languageOf } from '../domain/source/language'
import { diffSource, newSource, type Generated, type Shape } from '../domain/typst/generated'
import { nextShape } from '../domain/typst/rounds'
import { COMPILING, FALLBACK, type Fallback } from './compile-messages'
import { CompileInputs } from './compile-inputs'
import type { PdfMarks } from './pdf-marks'
import type { SessionActions, SessionState } from './session-state'

const DEBOUNCE_MS = 600
const MAX_COMPILES = 4
const NO_SHAPE = (): Shape => ({ unwrap: new Set(), omit: new Set() })

/** Compiles a Typst draft's generated sources in the browser and shows the PDF; one compile at a time, the newest request wins. */
export class CompiledPdf {
  private readonly inputs: CompileInputs
  private cancel: (() => void) | null = null
  private latest = 0
  private running = false
  private waiting = false
  private signature: string | null = null
  private compiled = false
  private startFailed = false
  constructor(private readonly s: SessionState, private readonly pdf: Pick<PdfMarks, 'showBytes' | 'showUploaded'>, private readonly actions: Pick<SessionActions, 'head' | 'render'>) {
    this.inputs = new CompileInputs(s.ports.api)
  }
  private wanted(): boolean {
    return !this.s.disposed && !!this.s.ports.compiler && languageOf(this.s.file) === 'typst' && !!this.s.review && this.s.view !== 'editor' && this.s.pdfLook !== 'original'
  }
  request(now: boolean): void {
    if (this.s.disposed) return
    if (!this.wanted()) { this.stop(); return }
    if (this.startFailed) return
    const signature = JSON.stringify([this.s.pdfLook, this.s.review!.items().flatMap(i => i.kind === 'proposal' ? [[i.id, i.from, i.quote.exact, i.proposal]] : [])])
    if (!now && signature === this.signature) return
    this.signature = signature; this.latest++
    this.cancel?.(); this.cancel = null
    if (now) this.start()
    else this.cancel = this.s.ports.scheduler.after(DEBOUNCE_MS, () => { this.cancel = null; this.start() })
  }
  private stop(): void {
    this.cancel?.(); this.cancel = null; this.latest++; this.signature = null
    if (this.s.view !== 'editor' && this.compiled) { this.compiled = false; this.s.omitted = new Set(); void this.pdf.showUploaded().then(() => this.actions.render()) }
    if (this.s.pdfNote) { this.s.pdfNote = ''; this.actions.head() }
  }
  private start(): void {
    if (this.running) { this.waiting = true; return }
    this.running = true
    void this.run().catch(() => this.fallback('compile')).finally(() => {
      this.running = false
      if (this.waiting) { this.waiting = false; this.start() }
    })
  }
  private generate(shape: Shape): Generated {
    const mode = this.s.pdfLook === 'new' ? newSource : diffSource
    return mode(this.s.review!, this.s.draft, this.s.ops, shape)
  }
  private async run(): Promise<void> {
    const token = this.latest
    const stale = () => !this.wanted() || token !== this.latest
    if (!this.s.pdfNote) this.note(COMPILING)
    const inputs = await this.inputs.gather(this.s.file, this.s.draft)
    if (stale()) return
    if (typeof inputs === 'string') { await this.fallback(inputs); return }
    let shape = NO_SHAPE(), draftOnly = false
    for (let n = 1; n <= MAX_COMPILES; n++) {
      const g = draftOnly || n === MAX_COMPILES ? null : this.generate(shape)
      const result = await this.s.ports.compiler!.compile({ main: this.s.file, sources: [{ path: this.s.file, text: g ? g.text : this.s.draft }, ...inputs.sources], files: inputs.files })
      if (stale()) return
      if ('failed' in result) { this.startFailed = true; await this.fallback('start'); return }
      if (result.diagnostics.some(d => d.severity === 'warning' && /unknown font family/i.test(d.message))) { await this.fallback('font'); return }
      if (result.pdf && !result.diagnostics.some(d => d.severity === 'error')) { await this.land(result.pdf, g, stale); return }
      if (!g) break
      const next = nextShape(g, shape, result.diagnostics)
      if (next === 'file') { await this.fallback('file'); return }
      if (next === 'draft') draftOnly = true
      else shape = next
    }
    await this.fallback('compile')
  }
  private async land(pdf: Uint8Array, g: Generated | null, stale: () => boolean): Promise<void> {
    this.s.omitted = new Set(g ? g.omitted : this.s.review!.items().flatMap(i => i.kind === 'proposal' ? [i.id] : []))
    await this.pdf.showBytes(pdf)
    this.compiled = true
    if (stale()) return
    this.s.pdfNote = ''
    this.actions.head(); this.actions.render()
  }
  private async fallback(reason: Fallback): Promise<void> {
    if (this.s.disposed) return
    this.s.omitted = new Set()
    if (this.compiled) { this.compiled = false; await this.pdf.showUploaded() }
    this.note(FALLBACK[reason]); this.actions.render()
  }
  private note(text: string): void { this.s.pdfNote = text; this.actions.head() }
  dispose(): void { this.cancel?.(); this.cancel = null; this.latest++ }
}
