import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Backup } from '../../src/app/ports'
import { createBrowserStore } from '../../src/adapters/storage/browser-store'
const backup: Backup = { review: '{}', pending: { body: '{}', revision: 2 }, revision: 1, saved: true, dirty: true, at: '2026-11-15T20:00:00Z' }
beforeEach(() => { localStorage.clear(); history.replaceState(null, '', '/index.php/apps/gloss/r/synthetic/') })
afterEach(() => vi.restoreAllMocks())
it.each(['/index.php/apps/gloss/r/synthetic', '/apps/gloss/r/synthetic'])('migrates path preferences once and shares them across route forms from %s', path => {
  history.replaceState(null, '', path)
  localStorage.setItem('gloss-review-id:' + path, 'remembered')
  localStorage.setItem('gloss-review-view:' + path, 'both')
  const store = createBrowserStore('synthetic')
  expect(store.rememberedKey()).toBe('remembered'); expect(store.view()).toBe('both')
  expect(localStorage.getItem('gloss-review-id:synthetic')).toBe('remembered')
  expect(localStorage.getItem('gloss-review-view:synthetic')).toBe('both')
  localStorage.setItem('gloss-review-id:' + path, 'stale')
  localStorage.setItem('gloss-review-view:' + path, 'editor')
  expect(store.rememberedKey()).toBe('remembered'); expect(store.view()).toBe('both')
  history.replaceState(null, '', path.startsWith('/index.php') ? '/apps/gloss/r/synthetic' : '/index.php/apps/gloss/r/synthetic')
  const reopened = createBrowserStore('synthetic')
  expect(reopened.rememberedKey()).toBe('remembered'); expect(reopened.view()).toBe('both')
  reopened.remember('new-key'); reopened.setView('pdf')
  expect(store.rememberedKey()).toBe('new-key'); expect(store.view()).toBe('pdf')
  expect(createBrowserStore('other').rememberedKey()).toBeNull()
  expect(createBrowserStore('other').view()).toBeNull()
})
it('stores backups and conflicts under the R22 keys and isolates shares and reviewers', () => {
  const store = createBrowserStore('synthetic')
  expect(store.read('key')).toBeNull()
  expect(store.readConflict('key')).toBeNull()
  expect(store.write('key', backup)).toBe(true)
  store.keepConflict('key', backup)
  expect(localStorage.getItem('gloss-review:synthetic:key')).toBe(JSON.stringify(backup))
  expect(localStorage.getItem('gloss-review:synthetic:key:conflict')).toBe(JSON.stringify(backup))
  expect(store.read('key')).toEqual(backup)
  expect(store.readConflict('key')).toEqual(backup)
  expect(store.read('other')).toBeNull()
  expect(createBrowserStore('other').read('key')).toBeNull()
})
it('returns null for corrupt storage and invalid view values', () => {
  const store = createBrowserStore('synthetic')
  for (const value of ['broken', 'null', '{}', '[]']) {
    localStorage.setItem('gloss-review:synthetic:key', value)
    localStorage.setItem('gloss-review:synthetic:key:conflict', value)
    expect(store.read('key')).toBeNull()
    expect(store.readConflict('key')).toBeNull()
  }
  localStorage.setItem('gloss-review-view:/index.php/apps/gloss/r/synthetic', 'invalid')
  expect(store.view()).toBeNull()
})
it('returns false on a refused write and tolerates unavailable storage', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full') })
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
  const store = createBrowserStore('synthetic')
  expect(store.write('key', backup)).toBe(false)
  expect(() => { store.remember('key'); store.keepConflict('key', backup); store.setView('both') }).not.toThrow()
  expect(store.read('key')).toBeNull()
  expect(store.readConflict('key')).toBeNull()
  expect(store.rememberedKey()).toBeNull()
  expect(store.view()).toBeNull()
})
it('I1 reads older backups and ignores every legacy refusal marker', () => {
  const store = createBrowserStore('synthetic')
  for (const refusal of [undefined, null, { status: 413, error: 'tooLarge' }, true, {}, { status: '413' }]) {
    localStorage.setItem('gloss-review:synthetic:key', JSON.stringify({ ...backup, refusal }))
    expect(store.read('key')).toEqual(backup)
  }
})
