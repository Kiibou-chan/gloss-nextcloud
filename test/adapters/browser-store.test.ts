import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Backup } from '../../src/app/ports'
import { createBrowserStore } from '../../src/adapters/storage/browser-store'
const backup: Backup = { review: '{}', pending: { body: '{}', revision: 2 }, revision: 1, saved: true, dirty: true, at: '2026-11-15T20:00:00Z' }
beforeEach(() => { localStorage.clear(); history.replaceState(null, '', '/index.php/apps/gloss/r/synthetic/') })
afterEach(() => vi.restoreAllMocks())
it('preserves the spike remembered-key and view keys based on the page path', () => {
  localStorage.setItem('gloss-review-id:/index.php/apps/gloss/r/synthetic', 'remembered')
  localStorage.setItem('gloss-review-view:/index.php/apps/gloss/r/synthetic', 'both')
  const store = createBrowserStore('synthetic')
  expect(store.rememberedKey()).toBe('remembered')
  expect(store.view()).toBe('both')
  store.remember('new-key'); store.setView('pdf')
  expect(localStorage.getItem('gloss-review-id:/index.php/apps/gloss/r/synthetic')).toBe('new-key')
  expect(localStorage.getItem('gloss-review-view:/index.php/apps/gloss/r/synthetic')).toBe('pdf')
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
