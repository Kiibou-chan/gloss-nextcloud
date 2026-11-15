import { expect, test } from 'vitest'
import { LinkKey, REVIEW_KEY } from '../../src/app/link-key'
import { SessionState } from '../../src/app/session-state'
import { fakes } from './fakes'

test('validates keys and publishes copy feedback only after a confirmed save', async () => {
  const f = fakes(), s = new SessionState(f.ports, { address: 'https://example.test/review#old', fragment: '' })
  const unit = new LinkKey(s)
  expect(REVIEW_KEY.test('Abcdef1234567890')).toBe(true)
  expect(REVIEW_KEY.test('Abcdef123456789!')).toBe(false)
  expect(REVIEW_KEY.test('Abcdef12345678901')).toBe(false)
  s.key = 'Abcdef1234567890'
  s.record = { revision: 1, name: 'Ada', draft: { file: 'draft.txt', etag: 'v1' }, sent: false, sentAt: null, updatedAt: f.clock.now(), items: [] }
  await unit.copyReviewLink()
  expect(f.clipboard.write).not.toHaveBeenCalled()
  s.saved = true; await unit.copyReviewLink()
  const url = 'https://example.test/review#Abcdef1234567890'
  expect(f.clipboard.write).toHaveBeenCalledWith(url)
  expect(f.panel.setLink).toHaveBeenLastCalledWith({ url, message: 'Link copied.' })
  s.blocked = true; unit.publishLink()
  expect(f.panel.setLink).toHaveBeenLastCalledWith(null)
})
