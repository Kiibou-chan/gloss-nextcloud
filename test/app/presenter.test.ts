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
