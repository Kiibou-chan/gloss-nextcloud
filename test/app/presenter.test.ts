import { expect, test, vi } from 'vitest'
import { Presenter } from '../../src/app/presenter'
import { SessionState } from '../../src/app/session-state'
import { DraftReview } from '../../src/domain/review/draft-review'
import { fakes } from './fakes'

test('publishes the head and count, updating only changed cards', () => {
  const f = fakes(), s = new SessionState(f.ports)
  const unit = new Presenter(s, { publishLink: vi.fn(), overallText: () => '', deferPdf: vi.fn() })
  unit.head()
  expect(f.panel.setHead).toHaveBeenLastCalledWith(expect.objectContaining({ editable: false, title: '' }))
  expect(f.panel.setOverallView).toHaveBeenCalledWith('')
  s.draft = 'alpha beta'; s.file = 'draft.txt'; s.review = new DraftReview(s.file, s.draft)
  s.review.comment({ from: 0, to: 5 }, 'note', f.ids.item(), f.clock.now())
  unit.render(); unit.render()
  expect(f.panel.setCount).toHaveBeenLastCalledWith({ changes: 0, comments: 1 })
  expect(f.panel.upsertCard).toHaveBeenCalledTimes(1)
  const id = s.review.items()[0]!.id
  s.review.deleteComment(id, 0); unit.render()
  expect(f.panel.removeCard).toHaveBeenCalledExactlyOnceWith(id)
  expect(f.panel.setCount).toHaveBeenLastCalledWith({ changes: 0, comments: 0 })
})

test('a card is off the PDF only outside the editor view, and only that card is redrawn', () => {
  const f = fakes(), s = new SessionState(f.ports)
  const unit = new Presenter(s, { publishLink: vi.fn(), overallText: () => '', deferPdf: vi.fn() })
  s.draft = 'alpha beta'; s.file = 'draft.txt'; s.review = new DraftReview(s.file, s.draft)
  s.review.comment({ from: 0, to: 5 }, 'one', f.ids.item(), f.clock.now())
  s.review.comment({ from: 6, to: 10 }, 'two', f.ids.item(), f.clock.now())
  const [a, b] = s.review.items().map(i => i.id)
  s.view = 'pdf'; s.offPdf = new Set([b!])
  unit.render()
  const cards = f.panel.upsertCard.mock.calls.map(c => c[0])
  expect(cards.find(c => c.id === a)).toMatchObject({ offPdf: false })
  expect(cards.find(c => c.id === b)).toMatchObject({ offPdf: true })
  f.panel.upsertCard.mockClear()
  s.view = 'editor'; unit.render()
  expect(f.panel.upsertCard).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: b, offPdf: false }))
})

test('the head carries the quiet line, and a card the compiler left out is off the PDF', () => {
  const f = fakes(), s = new SessionState(f.ports)
  const unit = new Presenter(s, { publishLink: vi.fn(), overallText: () => '', deferPdf: vi.fn() })
  s.draft = 'alpha beta'; s.file = 'draft.txt'; s.review = new DraftReview(s.file, s.draft)
  s.review.comment({ from: 0, to: 5 }, 'one', f.ids.item(), f.clock.now())
  s.view = 'pdf'; s.pdfNote = 'Showing your PDF while the draft compiles.'; s.omitted = new Set([s.review.items()[0]!.id])
  unit.render()
  expect(f.panel.setHead).toHaveBeenLastCalledWith(expect.objectContaining({ pdfNote: 'Showing your PDF while the draft compiles.' }))
  expect(f.panel.upsertCard).toHaveBeenLastCalledWith(expect.objectContaining({ offPdf: true }))
})

test('a card whose new words are in the PDF without marks says so, unless it is off the PDF', () => {
  const f = fakes(), s = new SessionState(f.ports)
  const unit = new Presenter(s, { publishLink: vi.fn(), overallText: () => '', deferPdf: vi.fn() })
  s.draft = 'alpha beta'; s.file = 'draft.typ'; s.review = new DraftReview(s.file, s.draft)
  s.review.comment({ from: 0, to: 5 }, 'one', f.ids.item(), f.clock.now())
  const id = s.review.items()[0]!.id
  s.view = 'pdf'; s.pdfDoc = { unmarked: new Set([id]) } as unknown as NonNullable<typeof s.pdfDoc>
  unit.render()
  expect(f.panel.upsertCard).toHaveBeenLastCalledWith(expect.objectContaining({ unmarked: true, offPdf: false }))
  s.offPdf = new Set([id]); unit.render()
  expect(f.panel.upsertCard).toHaveBeenLastCalledWith(expect.objectContaining({ unmarked: false, offPdf: true }))
})
