import { expect, test, vi } from 'vitest'
import { ReviewSession } from '../../src/app/session'
import { SessionItems } from '../../src/app/items'
import { SessionState } from '../../src/app/session-state'
import { fakes } from './fakes'

test('installs items, adds passage comments, and keeps raw overall text with no blank saved item', () => {
  const f = fakes(), s = new SessionState(f.ports)
  const actions = { changed: vi.fn(), editable: () => true, head: vi.fn(), render: vi.fn() }
  const unit = new SessionItems(s, actions)
  s.file = 'draft.txt'; s.draft = 'alpha'
  unit.install({ revision: 0, name: 'Ada', draft: { file: s.file, etag: 'v1' }, sent: false, sentAt: null, updatedAt: f.clock.now(), items: [] })
  expect(f.editor.text()).toBe('alpha')
  unit.commentOn({ from: 0, to: 5 }, 'note')
  expect(s.review!.items()[0]).toMatchObject({ kind: 'comment', quote: { exact: 'alpha' } })
  expect(actions.changed).toHaveBeenCalledOnce()
  unit.setOverall('overall'); unit.setOverall(' ')
  expect(unit.overallText()).toBe(' ')
  expect(s.record!.items).toEqual([])
})


test('C1 keeps an overlapping proposal raw and listed once after an overall edit', async () => {
  const f = fakes(), at = f.clock.now()
  const first = { id: '1111111111', kind: 'proposal', file: 'draft.txt', from: 0,
    quote: { exact: 'beta', prefix: '', suffix: '' }, proposal: 'first replacement', comments: [], at }
  const raw = '{ "id":"0000000002", "kind":"proposal", "file":"draft.txt", "from":11, "quote":{"exact":"beta","prefix":"","suffix":"","extra":3}, "proposal":"second replacement", "comments":[{"text":"Keep this note","at":"2026-11-15T20:00:00Z","extra":4}], "at":"2026-11-15T20:00:00Z", "unknown":{"keep":true} }'
  const review = JSON.stringify({ format: 1, revision: 1, name: 'Ada', draft: { file: 'draft.txt', etag: 'v1' },
    sent: false, sentAt: null, updatedAt: at, items: [first] }).replace(/]}$/, ',' + raw + ']}')
  f.api.draft.mockResolvedValue({ main: 'draft.txt', files: [{ file: 'draft.txt', text: 'beta', etag: 'v2' }] })
  f.api.open.mockResolvedValue({ review: JSON.parse(review), revision: 1, rawReview: review })
  const session = new ReviewSession(f.ports, { address: '', fragment: '#Abcdef1234567890' })
  try {
    await session.start()
    session.setOverall('A new overall comment')
    await f.advance(5000)
    for (let n = 0; n < 30; n++) await Promise.resolve()
    const saved = f.api.save.mock.lastCall![1]
    expect(saved).toContain(raw)
    const items = JSON.parse(saved).items
    expect(items).toHaveLength(3)
    expect(items.filter((item: { id: string }) => item.id === '0000000002')).toEqual([JSON.parse(raw)])
    expect(f.panel.setUnplaced).toHaveBeenLastCalledWith([{ id: '0000000002', quote: 'beta', proposal: 'second replacement', comments: JSON.parse(raw).comments }])
    expect(f.editor.text()).toBe('first replacement')
  } finally { session.dispose() }
})
