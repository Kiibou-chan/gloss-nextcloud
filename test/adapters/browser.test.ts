import { afterEach, expect, it, vi } from 'vitest'
import { browserClock } from '../../src/adapters/browser/clock'
import { browserIds } from '../../src/adapters/browser/ids'
import { browserScheduler } from '../../src/adapters/browser/scheduler'
import { browserClipboard } from '../../src/adapters/browser/clipboard'
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
it('reads the clock as an ISO time', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-15T20:00:00Z'))
  expect(browserClock.now()).toBe('2026-11-15T20:00:00.000Z')
})
it('schedules a callback and returns a cancellation function', () => {
  vi.useFakeTimers()
  const run = vi.fn()
  browserScheduler.after(300, run)
  const cancel = browserScheduler.after(200, run)
  cancel(); vi.advanceTimersByTime(299)
  expect(run).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(run).toHaveBeenCalledTimes(1)
})
it('makes keys and item ids with the required alphabets over 1,000 draws', () => {
  const keys = new Set<string>(), items = new Set<string>()
  for (let i = 0; i < 1000; i++) {
    const key = browserIds.key(), item = browserIds.item()
    expect(key).toMatch(/^[A-Za-z0-9]{16}$/)
    expect(item).toMatch(/^[a-z0-9]{10}$/)
    keys.add(key); items.add(item)
  }
  expect(keys.size).toBe(1000); expect(items.size).toBe(1000)
})
it('rejects random bytes outside the unbiased alphabet range', () => {
  vi.spyOn(crypto, 'getRandomValues').mockImplementation(array => {
    const bytes = array as Uint8Array
    bytes.fill(0); bytes[0] = 255
    return array
  })
  expect(browserIds.key()).toBe('A'.repeat(16))
  expect(browserIds.item()).toBe('a'.repeat(10))
})
it('writes to the clipboard and returns false on refusal or absence', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  expect(await browserClipboard.write('synthetic link')).toBe(true)
  expect(writeText).toHaveBeenCalledWith('synthetic link')
  writeText.mockRejectedValue(new Error('refused'))
  expect(await browserClipboard.write('synthetic link')).toBe(false)
  vi.stubGlobal('navigator', {})
  expect(await browserClipboard.write('synthetic link')).toBe(false)
})
