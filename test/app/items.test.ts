import { expect, test, vi } from 'vitest'
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
