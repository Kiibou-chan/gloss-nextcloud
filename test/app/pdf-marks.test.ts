import { expect, test, vi } from 'vitest'
import { PdfMarks } from '../../src/app/pdf-marks'
import { SessionState } from '../../src/app/session-state'
import { DraftReview } from '../../src/domain/review/draft-review'
import { plainOps } from '../../src/domain/source/typst-parse'
import { fakes } from './fakes'

test('defers PDF marks, reuses unchanged placements, and cancels on disposal', async () => {
  const f = fakes(), s = new SessionState(f.ports)
  const unit = new PdfMarks(s, { head: vi.fn() })
  s.draft = 'alpha beta gamma delta'; s.file = 'draft.txt'; s.ops = plainOps(s.draft)
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
