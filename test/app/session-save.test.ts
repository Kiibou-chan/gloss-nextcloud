import { expect, test, vi } from 'vitest'
import { SessionSave } from '../../src/app/session-save'
import { SessionState } from '../../src/app/session-state'
import { DraftReview } from '../../src/domain/review/draft-review'
import { fakes } from './fakes'

test('backs up changes after 300 ms and saves with explicit options after five seconds', async () => {
  const f = fakes(), s = new SessionState(f.ports)
  const actions = { clearLinkMessage: vi.fn(), editable: () => true, head: vi.fn(), keepConflict: vi.fn(), overallText: () => '', refusal: vi.fn(), render: vi.fn() }
  const unit = new SessionSave(s, actions)
  s.key = 'Abcdef1234567890'; s.file = 'draft.txt'; s.draft = 'alpha'
  s.record = { revision: 0, name: 'Ada', draft: { file: s.file, etag: 'v1' }, sent: false, sentAt: null, updatedAt: f.clock.now(), items: [] }
  s.review = new DraftReview(s.file, s.draft); f.editor.setText(s.draft)
  unit.createQueue(); unit.backup(false); unit.changed()
  await f.advance(299)
  expect(f.store.read(s.key)?.dirty).toBe(false)
  await f.advance(1)
  expect(f.store.read(s.key)?.dirty).toBe(true)
  expect(actions.clearLinkMessage).toHaveBeenCalledOnce()
  await f.advance(4700)
  expect(f.api.save).toHaveBeenCalledWith(s.key, expect.any(String), 0, {})
  expect(f.store.read(s.key)).toMatchObject({ dirty: false, saved: true, revision: 1 })
  unit.changed(); unit.dispose(); await f.advance(5000)
  expect(f.api.save).toHaveBeenCalledTimes(1)
})

test.each([403, 404, 410, 413])('applies explicit refusal editability at the save call site for %i', async status => {
  const f = fakes(), s = new SessionState(f.ports)
  const actions = { clearLinkMessage: vi.fn(), editable: () => true, head: vi.fn(), keepConflict: vi.fn(), overallText: () => '', refusal: vi.fn(() => ({ text: 'Refused.', blocks: status !== 413 })), render: vi.fn() }
  s.key = 'Abcdef1234567890'; s.file = 'draft.txt'; s.draft = 'alpha'
  s.record = { revision: 0, name: 'Ada', draft: { file: s.file, etag: 'v1' }, sent: false, sentAt: null, updatedAt: f.clock.now(), items: [] }
  s.review = new DraftReview(s.file, s.draft); f.editor.setText(s.draft)
  f.api.save.mockResolvedValue({ status, error: 'refused' })
  const unit = new SessionSave(s, actions); unit.createQueue(); unit.changed(); await f.advance(5000)
  expect(s.status).toBe('Refused.'); expect(s.blocked).toBe(status !== 413)
  expect(f.ports.reviewable).toBe(status !== 403)
  unit.dispose()
})
