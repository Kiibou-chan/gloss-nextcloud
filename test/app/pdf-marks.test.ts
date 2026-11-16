import { expect, test, vi } from 'vitest'
import { PdfMarks } from '../../src/app/pdf-marks'
import { SessionState } from '../../src/app/session-state'
import { DraftReview } from '../../src/domain/review/draft-review'
import { sourceKey } from '../../src/domain/pdf/match'
import { plainOps } from '../../src/domain/source/typst-parse'
import { fakes } from './fakes'

test('defers PDF marks, reuses unchanged placements, and cancels on disposal', async () => {
  const f = fakes(), s = new SessionState(f.ports)
  const unit = new PdfMarks(s, { head: vi.fn() })
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
  const head = vi.fn(), unit = new PdfMarks(s, { head })
  const loading = unit.setView('pdf')
  expect(s.status).toBe('Loading the PDF…')
  expect(head).toHaveBeenCalled()
  resolve({ pages: [['alpha']] }); await loading
  expect(s.status).toBe('')
})

function proposed(change: { from: number; to: number; insert: string }) {
  const f = fakes(), s = new SessionState(f.ports)
  const unit = new PdfMarks(s, { head: vi.fn() })
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
  const f = fakes(), s = new SessionState(f.ports), unit = new PdfMarks(s, { head: vi.fn() })
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
