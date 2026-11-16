import { expect, test, vi } from 'vitest'
import { compiledDoc } from '../../src/app/compiled-doc'
import { CompiledPdf } from '../../src/app/compiled-pdf'
import { PdfMarks } from '../../src/app/pdf-marks'
import { SessionState } from '../../src/app/session-state'
import { DraftReview } from '../../src/domain/review/draft-review'
import { sourceKey } from '../../src/domain/pdf/match'
import { parseTypst } from '../../src/domain/source/typst-parse'
import type { CompileResult } from '../../src/app/ports'
import { fakes } from './fakes'

const DRAFT = 'Alpha beta gamma delta.\n'
const OK: CompileResult = { pdf: new Uint8Array([1, 2, 3]), diagnostics: [], ms: 1 }
const failing = (message = 'unexpected token', line: number | null = null): CompileResult => ({ pdf: null, diagnostics: [{ severity: 'error', message, line }], ms: 1 })
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve() }

async function setup(draft = DRAFT, view: 'pdf' | 'editor' = 'pdf') {
  const f = fakes(), s = new SessionState(f.ports)
  s.draft = draft; s.file = 'paper.typ'; s.ops = parseTypst(draft); s.source = sourceKey(s.file, draft, s.ops)
  s.review = new DraftReview(s.file, draft)
  f.compiler.compile.mockResolvedValue(OK)
  const head = vi.fn(), render = vi.fn()
  const marks = new PdfMarks(s, { head, render, compile: vi.fn() })
  if (view === 'pdf') await marks.setView('pdf')
  const unit = new CompiledPdf(s, marks, { head, render })
  const propose = (from = 6, to = 10, insert = 'zeta') => { s.review!.edit([{ from, to, insert }], f.ids.item, f.clock.now()) }
  return { f, s, unit, marks, head, render, propose }
}

test('three edits send one compile, 600 ms after the last', async () => {
  const { f, unit, propose } = await setup()
  propose(); unit.request(false); await f.advance(300)
  propose(11, 16, 'omega'); unit.request(false); await f.advance(300)
  propose(17, 22, 'sigma'); unit.request(false)
  await f.advance(599); await flush()
  expect(f.compiler.compile).not.toHaveBeenCalled()
  await f.advance(1); await flush()
  expect(f.compiler.compile).toHaveBeenCalledTimes(1)
  expect(f.pdf.showBytes).toHaveBeenCalledWith(OK.pdf)
})

test('compiles the diff source of the look, with the main file under its own path', async () => {
  const { f, s, unit, propose } = await setup()
  propose(); unit.request(true); await flush()
  const job = f.compiler.compile.mock.calls[0]![0]
  expect(job.main).toBe('paper.typ')
  expect(job.sources[0]).toMatchObject({ path: 'paper.typ' })
  expect(job.sources[0]!.text).toContain('#gloss-review-del[beta];#gloss-review-ins[zeta];')
  s.pdfLook = 'new'; unit.request(true); await flush()
  expect(f.compiler.compile.mock.calls[1]![0].sources[0]!.text).toContain('#gloss-review-new[zeta];')
})

test('an edit during a compile queues one, and the older result is never shown', async () => {
  const { f, unit, propose } = await setup()
  let first!: (r: CompileResult) => void
  f.compiler.compile.mockImplementationOnce(() => new Promise(done => { first = done }))
  propose(); unit.request(true); await flush()
  propose(11, 16, 'omega'); unit.request(false); await f.advance(600); await flush()
  expect(f.compiler.compile).toHaveBeenCalledTimes(1)
  first(OK); await flush()
  expect(f.pdf.showBytes).toHaveBeenCalledTimes(1)
  expect(f.compiler.compile).toHaveBeenCalledTimes(2)
  expect(f.compiler.compile.mock.calls[1]![0].sources[0]!.text).toContain('omega')
})

test('a look switch compiles at once, and the editor view compiles nothing', async () => {
  const { f, s, unit, propose } = await setup()
  propose(); s.pdfLook = 'new'; unit.request(true); await flush()
  expect(f.compiler.compile).toHaveBeenCalledTimes(1)
  s.view = 'editor'; propose(11, 16, 'omega'); unit.request(true); unit.request(false); await f.advance(1000); await flush()
  expect(f.compiler.compile).toHaveBeenCalledTimes(1)
})

test('Original shows the uploaded PDF again and compiles nothing', async () => {
  const { f, s, unit, propose } = await setup()
  propose(); unit.request(true); await flush()
  expect(f.pdf.show).toHaveBeenCalledTimes(1)
  s.pdfLook = 'original'; unit.request(true); await flush()
  expect(f.pdf.show).toHaveBeenCalledTimes(2)
  expect(f.compiler.compile).toHaveBeenCalledTimes(1)
  s.pdfLook = 'changes'; unit.request(true); await flush()
  expect(f.compiler.compile).toHaveBeenCalledTimes(2)
})

test('the quiet line says the draft compiles until its PDF lands, then nothing', async () => {
  const { f, s, unit, head } = await setup()
  let done!: (r: CompileResult) => void
  f.compiler.compile.mockImplementationOnce(() => new Promise(r => { done = r }))
  unit.request(true); await flush()
  expect(s.pdfNote).toBe('Showing your PDF while the draft compiles.')
  expect(head).toHaveBeenCalled()
  done(OK); await flush()
  expect(s.pdfNote).toBe('')
})

test('a package import shows the PDF with its line and starts no compiler', async () => {
  const { f, s, unit } = await setup('#import "@preview/example:0.1.0"\n' + DRAFT)
  unit.request(true); await flush()
  expect(s.pdfNote).toBe('Showing your PDF; the draft uses a package the browser cannot load.')
  expect(f.compiler.compile).not.toHaveBeenCalled(); expect(f.api.file).not.toHaveBeenCalled()
  expect(f.pdf.showBytes).not.toHaveBeenCalled()
})

test('a package imported by a read file gives the package line', async () => {
  const { f, s, unit } = await setup('#include "ch.typ"\n' + DRAFT)
  f.api.file.mockResolvedValue({ bytes: new Uint8Array(), text: '#import "@local/x:1.0.0"\n' })
  unit.request(true); await flush()
  expect(s.pdfNote).toContain('a package')
  expect(f.compiler.compile).not.toHaveBeenCalled()
})

test('a read file the server refuses gives the file line, and a .typ that is not text does too', async () => {
  const { f, s, unit } = await setup('#bibliography("refs.bib")\n' + DRAFT)
  unit.request(true); await flush()
  expect(f.api.file).toHaveBeenCalledWith('refs.bib')
  expect(s.pdfNote).toBe('Showing your PDF; the draft reads a file the browser cannot load.')
  expect(f.compiler.compile).not.toHaveBeenCalled()
  const g = await setup('#include "ch.typ"\n' + DRAFT)
  g.f.api.file.mockResolvedValue({ bytes: new Uint8Array([255]), text: null })
  g.unit.request(true); await flush()
  expect(g.s.pdfNote).toContain('reads a file')
})

test('read files are fetched once across compiles and travel with the job, followed through .typ files', async () => {
  const { f, unit } = await setup('#include "ch/one.typ"\n#bibliography("refs.bib")\n' + DRAFT)
  f.api.file.mockImplementation(async path => path === 'ch/one.typ' ? { bytes: new Uint8Array(), text: '#image("fig.png")\n' } : { bytes: new Uint8Array([9]), text: null })
  unit.request(true); await flush(); unit.request(true); await flush()
  expect(f.compiler.compile).toHaveBeenCalledTimes(2)
  expect(f.api.file.mock.calls.map(c => c[0]).sort()).toEqual(['ch/fig.png', 'ch/one.typ', 'refs.bib'])
  const job = f.compiler.compile.mock.calls[1]![0]
  expect(job.sources.map(s => s.path)).toEqual(['paper.typ', 'ch/one.typ'])
  expect(job.files.map(x => x.path).sort()).toEqual(['ch/fig.png', 'refs.bib'])
})

test('a file not found diagnostic gives the file line at once', async () => {
  const { f, s, unit, propose } = await setup()
  propose(); f.compiler.compile.mockResolvedValue(failing('failed to load file (access denied)', 1))
  unit.request(true); await flush()
  expect(f.compiler.compile).toHaveBeenCalledTimes(1)
  expect(s.pdfNote).toContain('reads a file')
})

test('the rounds unwrap, leave out, then compile the draft, and stop at four compiles', async () => {
  const { f, s, unit, propose } = await setup()
  propose(); f.compiler.compile.mockResolvedValue(failing())
  unit.request(true); await flush()
  expect(f.compiler.compile).toHaveBeenCalledTimes(4)
  expect(f.compiler.compile.mock.calls[3]![0].sources[0]!.text).toBe(DRAFT)
  expect(s.pdfNote).toBe('Showing your PDF; the draft does not compile in the browser.')
  expect(f.pdf.showBytes).not.toHaveBeenCalled()
})

test('a proposal on the error line is unwrapped alone', async () => {
  const { f, s, unit, propose } = await setup('Alpha beta\n\nGamma delta.\n')
  propose(0, 5, 'Omega'); propose(12, 17, 'Sigma')
  f.compiler.compile.mockResolvedValueOnce(failing('boom', 5)).mockResolvedValue(OK)
  unit.request(true); await flush()
  const text = f.compiler.compile.mock.calls[1]![0].sources[0]!.text
  expect(text).toContain('#gloss-review-ins[Omega];')
  expect(text).toContain('Sigma')
  expect(text).not.toContain('#gloss-review-ins[Sigma];')
  expect(s.pdfNote).toBe('')
})

test('when the draft itself compiles its PDF is shown with every card off the PDF, and no fallback', async () => {
  const { f, s, unit, propose } = await setup()
  propose()
  f.compiler.compile.mockResolvedValueOnce(failing()).mockResolvedValueOnce(failing()).mockResolvedValueOnce(failing()).mockResolvedValueOnce(OK)
  unit.request(true); await flush()
  expect(f.pdf.showBytes).toHaveBeenCalledTimes(1)
  expect(s.pdfNote).toBe('')
  expect([...s.omitted]).toEqual(s.review!.items().map(i => i.id))
})

test('a round sequence issues no further compile once a newer request waits', async () => {
  const { f, unit, propose } = await setup()
  let first!: (r: CompileResult) => void
  f.compiler.compile.mockImplementationOnce(() => new Promise(done => { first = done })).mockResolvedValue(OK)
  propose(); unit.request(true); await flush()
  propose(11, 16, 'omega'); unit.request(false); await f.advance(600)
  first(failing()); await flush()
  expect(f.compiler.compile).toHaveBeenCalledTimes(2)
  expect(f.compiler.compile.mock.calls[1]![0].sources[0]!.text).toContain('omega')
})

test('a missing font warning gives the font line and keeps the uploaded PDF', async () => {
  const { f, s, unit } = await setup()
  f.compiler.compile.mockResolvedValue({ pdf: OK.pdf, diagnostics: [{ severity: 'warning', message: 'unknown font family: nonexistent sans', line: 1 }], ms: 1 })
  unit.request(true); await flush()
  expect(s.pdfNote).toBe('Showing your PDF; the draft uses a font the browser does not have.')
  expect(f.pdf.showBytes).not.toHaveBeenCalled()
})

test('a compiler that cannot start gives its line and no further compiles', async () => {
  const { f, s, unit } = await setup()
  f.compiler.compile.mockResolvedValue({ failed: 'start' })
  unit.request(true); await flush()
  expect(s.pdfNote).toBe('Showing your PDF; the browser could not start the compiler.')
  unit.request(true); unit.request(false); await f.advance(1000); await flush()
  expect(f.compiler.compile).toHaveBeenCalledTimes(1)
})

test('disposal cancels a waiting compile', async () => {
  const { f, unit, propose } = await setup()
  propose(); unit.request(false); unit.dispose(); await f.advance(1000); await flush()
  expect(f.compiler.compile).not.toHaveBeenCalled()
})

test('PdfMarks.showBytes shows the bytes and places every mark again on the new document', async () => {
  const { f, s, marks } = await setup()
  s.review!.comment({ from: 0, to: 5 }, 'note', f.ids.item(), f.clock.now())
  marks.deferPdf(); await f.advance(400)
  expect(f.pdf.setMarks).toHaveBeenCalledTimes(1)
  await marks.showBytes(new Uint8Array([7]), compiledDoc(s.file, DRAFT, s.ops, null))
  expect(f.pdf.showBytes).toHaveBeenCalledWith(new Uint8Array([7]))
  await f.advance(400)
  expect(f.pdf.setMarks).toHaveBeenCalledTimes(2)
})
