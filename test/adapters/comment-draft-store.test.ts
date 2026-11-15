import { afterEach, expect, it, vi } from 'vitest'
import { createCommentDraftStore } from '../../src/adapters/storage/comment-draft-store'

afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear() })
it('keeps private drafts in sessionStorage, isolated by share and review, across adapter recreation', () => {
  const local = vi.spyOn(localStorage, 'setItem')
  const store = createCommentDraftStore('synthetic-share')
  store.write('synthetic-review', 'private synthetic draft')
  expect(createCommentDraftStore('synthetic-share').read('synthetic-review')).toBe('private synthetic draft')
  expect(store.read('other-review')).toBeNull()
  expect(createCommentDraftStore('other-share').read('synthetic-review')).toBeNull()
  expect(local).not.toHaveBeenCalled()
  store.clear('synthetic-review')
  expect(store.read('synthetic-review')).toBeNull()
})
it('tolerates blocked sessionStorage', () => {
  for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
    vi.spyOn(Storage.prototype, method).mockImplementation(() => { throw new Error('blocked') })
  }
  const store = createCommentDraftStore('synthetic')
  expect(() => { store.write('key', 'note'); store.clear('key') }).not.toThrow()
  expect(store.read('key')).toBeNull()
})
