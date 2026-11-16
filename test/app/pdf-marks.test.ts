import { expect, test, vi } from 'vitest'
import { PdfMarks } from '../../src/app/pdf-marks'
import { SessionState } from '../../src/app/session-state'
import { DraftReview } from '../../src/domain/review/draft-review'
import { sourceKey } from '../../src/domain/pdf/match'
import { plainOps } from '../../src/domain/source/typst-parse'
import type { PdfPort } from '../../src/app/ports'
import { fakes } from './fakes'

test('defers PDF marks, reuses unchanged placements, and cancels on disposal', async () => {
  const f = fakes(), s = new SessionState(f.ports)
  const unit = new PdfMarks(s, { head: vi.fn(), render: vi.fn() })
  s.draft = 'alpha beta gamma delta'; s.file = 'draft.txt'; s.ops = plainOps(s.draft); s.source = sourceKey(s.file, s.draft, s.ops)
  s.review = new DraftReview(s.file, s.draft)
  s.review.comment({ from: 0, to: 5 }, 'note', f.ids.item(), f.clock.now())
  await unit.setView('pdf')
  expect(f.pdf.show).toHaveBeenCalledTimes(1)
  await f.advance(399)
  expect(f.pdf.setMarks).not.toHaveBeenCalled()
  await f.advance(1)
  expect(f.pdf.setMarks).toHaveBeenCalledTimes(1)
  expect(f.pdf.setMarks.mock.lastCall![0]).toHaveLength(1)
  s.review.comment({ id: s.review.items()[0]!.id }, 'another note', f.ids.item(), f.clock.now())
  unit.deferPdf(); await f.advance(400)
  expect(f.pdf.setMarks).toHaveBeenCalledTimes(1)
  s.review.comment({ from: 6, to: 10 }, 'new mark', f.ids.item(), f.clock.now())
  unit.deferPdf(); unit.dispose(); await f.advance(400)
  expect(f.pdf.setMarks).toHaveBeenCalledTimes(1)
})

test('announces PDF loading before show resolves and clears it afterwards', async () => {
  const f = fakes(), s = new SessionState(f.ports)
  let resolve!: (value: { pages: string[][] }) => void
  f.pdf.show.mockImplementation(() => new Promise(done => { resolve = done }))
  const head = vi.fn(), unit = new PdfMarks(s, { head, render: vi.fn() })
  const loading = unit.setView('pdf')
  expect(s.status).toBe('Loading the PDF…')
  expect(head).toHaveBeenCalled()
  resolve({ pages: [['alpha']] }); await loading
  expect(s.status).toBe('')
})

function proposed(change: { from: number; to: number; insert: string }) {
  const f = fakes(), s = new SessionState(f.ports)
  const unit = new PdfMarks(s, { head: vi.fn(), render: vi.fn() })
  s.draft = 'alpha beta gamma delta'; s.file = 'draft.txt'; s.ops = plainOps(s.draft); s.source = sourceKey(s.file, s.draft, s.ops)
  s.review = new DraftReview(s.file, s.draft)
  s.review.edit([change], f.ids.item, f.clock.now())
  return { f, s, unit }
}
const marks = (f: ReturnType<typeof fakes>) => f.pdf.setMarks.mock.lastCall![0]

test.each([
  ['a replacement', { from: 6, to: 10, insert: 'zeta' }, [{ look: 'struck', startOffset: 6, endOffset: 10 }, { look: 'insert', offset: 9, edge: 'after', words: 'zeta' }]],
  ['a deletion', { from: 6, to: 11, insert: '' }, [{ look: 'struck', startOffset: 6, endOffset: 10 }]],
  ['an insertion', { from: 10, to: 10, insert: ' more' }, [{ look: 'insert', offset: 9, edge: 'after', words: 'more' }]],
  ['a punctuation change', { from: 5, to: 6, insert: ';' }, [{ look: 'insert', edge: 'after', words: ';' }]],
  ['a line break', { from: 10, to: 11, insert: '\n' }, [{ look: 'insert', words: '(line break)' }]],
])('draws %s as struck marks and a caret', async (_name, change, expected) => {
  const { f, unit } = proposed(change)
  await unit.setView('pdf'); await f.advance(400)
  expect(marks(f)).toHaveLength(expected.length)
  expected.forEach((e, i) => expect(marks(f)[i]).toMatchObject(e))
})

test('a comment is a note and the editor view gets nothing', async () => {
  const f = fakes(), s = new SessionState(f.ports), unit = new PdfMarks(s, { head: vi.fn(), render: vi.fn() })
  s.draft = 'alpha beta gamma delta'; s.file = 'draft.txt'; s.ops = plainOps(s.draft); s.source = sourceKey(s.file, s.draft, s.ops)
  s.review = new DraftReview(s.file, s.draft)
  s.review.comment({ from: 0, to: 5 }, 'note', f.ids.item(), f.clock.now())
  await unit.setView('editor'); unit.deferPdf(); await f.advance(400)
  expect(f.pdf.setMarks).not.toHaveBeenCalled()
  await unit.setView('pdf'); await f.advance(400)
  expect(marks(f)).toMatchObject([{ look: 'note', startOffset: 0, endOffset: 5 }])
})

test('an unchanged proposal is not placed again', async () => {
  const { f, s, unit } = proposed({ from: 6, to: 10, insert: 'zeta' })
  await unit.setView('pdf'); await f.advance(400)
  s.review!.comment({ from: 0, to: 5 }, 'note', f.ids.item(), f.clock.now())
  unit.deferPdf(); await f.advance(400)
  expect(f.pdf.setMarks).toHaveBeenCalledTimes(2)
  expect(marks(f)).toHaveLength(3)
  unit.deferPdf(); await f.advance(400)
  expect(f.pdf.setMarks).toHaveBeenCalledTimes(2)
})

test('ids with no place stay in offPdf, render runs only when the set changes, and the editor view redraws', async () => {
  const f = fakes(), s = new SessionState(f.ports), render = vi.fn(), unit = new PdfMarks(s, { head: vi.fn(), render })
  s.draft = 'alpha beta gamma delta zzzz qqqq'; s.file = 'draft.txt'; s.ops = plainOps(s.draft); s.source = sourceKey(s.file, s.draft, s.ops)
  s.review = new DraftReview(s.file, s.draft)
  s.review.comment({ from: 0, to: 5 }, 'found', f.ids.item(), f.clock.now())
  s.review.comment({ from: 23, to: 27 }, 'lost', f.ids.item(), f.clock.now())
  const [found, lost] = s.review.items().map(i => i.id)
  await unit.setView('pdf'); render.mockClear()
  await f.advance(400)
  expect([...s.offPdf]).toEqual([lost])
  expect(s.offPdf.has(found!)).toBe(false)
  expect(render).toHaveBeenCalledTimes(1)
  s.review.comment({ id: found! }, 'more', f.ids.item(), f.clock.now())
  unit.deferPdf(); await f.advance(400)
  expect(render).toHaveBeenCalledTimes(1)
  render.mockClear()
  await unit.setView('editor')
  expect(render).toHaveBeenCalledTimes(1)
})

test('ids the PDF view reports as undrawn join offPdf and leave it when drawn again', async () => {
  const f = fakes(), s = new SessionState(f.ports), render = vi.fn(), unit = new PdfMarks(s, { head: vi.fn(), render })
  let report: (ids: readonly string[]) => void = () => {}
  ;(f.pdf as PdfPort).onUndrawn = listener => { report = listener; return () => {} }
  s.draft = 'alpha beta gamma delta'; s.file = 'draft.txt'; s.ops = plainOps(s.draft); s.source = sourceKey(s.file, s.draft, s.ops)
  s.review = new DraftReview(s.file, s.draft)
  s.review.comment({ from: 0, to: 5 }, 'found', f.ids.item(), f.clock.now())
  const [found] = s.review.items().map(i => i.id)
  await unit.setView('pdf'); await f.advance(400)
  expect(s.offPdf.size).toBe(0)
  render.mockClear()
  report([found!])
  expect(s.offPdf.has(found!)).toBe(true)
  expect(render).toHaveBeenCalledTimes(1)
  report([])
  expect(s.offPdf.size).toBe(0)
})

test('Original places only comment highlights, and a live switch Changes, Original, Changes counts each kind', async () => {
  const { f, s, unit } = proposed({ from: 6, to: 10, insert: 'zeta' })
  s.review!.comment({ from: 0, to: 5 }, 'note', f.ids.item(), f.clock.now())
  const kinds = () => { const m = marks(f); return { struck: m.filter(x => x.look === 'struck').length, insert: m.filter(x => x.look === 'insert').length, note: m.filter(x => x.look === 'note').length } }
  await unit.setView('pdf'); await f.advance(400)
  expect(kinds()).toEqual({ struck: 1, insert: 1, note: 1 })
  unit.setPdfLook('original'); await f.advance(400)
  expect(kinds()).toEqual({ struck: 0, insert: 0, note: 1 })
  unit.setPdfLook('changes'); await f.advance(400)
  expect(kinds()).toEqual({ struck: 1, insert: 1, note: 1 })
})

test('a fresh session on Original places only comment highlights', async () => {
  const { f, s, unit } = proposed({ from: 6, to: 10, insert: 'zeta' })
  s.review!.comment({ from: 0, to: 5 }, 'note', f.ids.item(), f.clock.now())
  s.pdfLook = 'original'
  await unit.setView('pdf'); await f.advance(400)
  expect(marks(f).map(x => x.look)).toEqual(['note'])
})
