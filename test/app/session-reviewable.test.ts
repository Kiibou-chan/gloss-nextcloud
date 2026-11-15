import { describe, expect, it, vi } from 'vitest'
import { ReviewSession } from '../../src/app/session'
import type { Backup } from '../../src/app/ports'
import { fakes } from './fakes'

const key = 'Abcdef1234567890'
function backup(saved = false): Backup {
  return { review: JSON.stringify({ format: 1, revision: saved ? 3 : 1, name: 'Ada', draft: { file: 'draft.txt', etag: 'v1' }, sent: false, sentAt: null, updatedAt: '2026-11-15T20:00:00.000Z', items: [{ id: 'abcdefghij', kind: 'proposal', file: 'draft.txt', from: 6, quote: { exact: 'beta', prefix: 'alpha ', suffix: ' gamma delta' }, proposal: 'blue', comments: [], at: '2026-11-15T20:00:00.000Z' }] }), pending: null, revision: saved ? 3 : 0, saved, dirty: true, at: '2026-11-15T20:00:00.000Z' }
}
const sentences = [
  [403, 'notReviewable', 'This link is not set up for reviewing.'],
  [404, 'missing', 'This review link no longer works. Your changes are kept in this browser.'],
  [409, 'conflict', 'Your review was changed in another window or on another device. Reload the page to continue.'],
  [409, 'sent', 'This review has already been sent.'],
  [409, 'full', 'This link has reached its limit of 50 reviews. Please write to the person who sent you the link.'],
  [409, 'reviewsBlocked', 'The reviews folder is blocked by a file. Please write to the person who sent you the link.'],
  [410, 'gone', 'This review link no longer works. Your changes are kept in this browser.'],
  [413, 'tooLarge', 'Your review is over 1 MB and cannot be saved; shorten some comments.'],
  [429, 'limited', 'The server is refusing saves for now. Your changes are kept in this browser; reload the page later to try again.'],
] as const

describe('reviewable links and remembered reviews', () => {
  it('keeps an unreviewable link read-only without opening or saving, even with a remembered review', async () => {
    const f = fakes(); f.store.remember(key); f.store.write(key, backup(true))
    const s = new ReviewSession({ ...f.ports, reviewable: false }); await s.start(); await s.setName('Ada')
    f.editor.replace({ from: 6, to: 10, insert: 'blue' }); await s.send(); await f.advance(1000)
    expect(f.head()).toMatchObject({ reviewable: false, editable: false, canSend: false, status: sentences[0][2] })
    expect(f.api.open).not.toHaveBeenCalled(); expect(f.api.save).not.toHaveBeenCalled()
  })
  it('makes and remembers a key for the first name, keeps it on renaming, and saves with base zero', async () => {
    const f = fakes(); const ids = vi.spyOn(f.ids, 'key'); const s = new ReviewSession(f.ports)
    await s.start(); expect(ids).not.toHaveBeenCalled(); await s.setName('Ada')
    expect(ids).toHaveBeenCalledTimes(1); expect(f.store.rememberedKey()).toBe(key); expect(f.api.open).not.toHaveBeenCalled()
    f.editor.replace({ from: 6, to: 10, insert: 'blue' }); await s.setName('Ada L'); await f.advance(5000)
    expect(ids).toHaveBeenCalledTimes(1); expect(f.editor.text()).toBe('alpha blue gamma delta')
    expect(f.api.save).toHaveBeenLastCalledWith(key, expect.any(String), 0)
    expect(JSON.parse(f.api.save.mock.lastCall![1])).toMatchObject({ name: 'Ada L', revision: 1 })
  })
  it('opens a remembered saved review on load and preserves its revision', async () => {
    const f = fakes(); f.store.remember(key); f.store.write(key, backup(true))
    f.api.open.mockResolvedValue({ review: JSON.parse(backup(true).review), revision: 3 })
    const s = new ReviewSession(f.ports); await s.start()
    expect(f.api.open).toHaveBeenCalledExactlyOnceWith(key); expect(f.head()).toMatchObject({ name: 'Ada', editable: true })
    expect(f.editor.text()).toBe('alpha blue gamma delta'); s.commentOn({ from: 0, to: 5 }, 'Synthetic note'); await f.advance(5000)
    expect(f.api.save.mock.lastCall![2]).toBe(3)
  })
  it('restores an unsaved backup on reload without opening an unknown server key', async () => {
    const f = fakes(); f.store.remember(key); f.store.write(key, backup())
    const s = new ReviewSession(f.ports); await s.start()
    expect(f.api.open).not.toHaveBeenCalled(); expect(f.head()).toMatchObject({ name: 'Ada', editable: true })
    expect(f.editor.text()).toBe('alpha blue gamma delta'); s.commentOn({ from: 0, to: 5 }, 'Synthetic note'); await f.advance(5000)
    expect(f.api.save.mock.lastCall![2]).toBe(0)
  })
  it('starts empty on the same key when a saved review has gone', async () => {
    const f = fakes(); f.store.remember(key); f.store.write(key, backup(true))
    const s = new ReviewSession(f.ports); await s.start(); await s.setName('Ada')
    expect(f.api.open).toHaveBeenCalledExactlyOnceWith(key); expect(f.editor.text()).toBe('alpha beta gamma delta')
    f.editor.replace({ from: 6, to: 10, insert: 'blue' }); await f.advance(5000)
    expect(f.api.save.mock.lastCall![0]).toBe(key); expect(f.api.save.mock.lastCall![2]).toBe(0)
  })
  it('refuses a review over 1 MiB before calling save, retaining the backup', async () => {
    const f = fakes(); const s = new ReviewSession(f.ports); await s.start(); await s.setName('Ada')
    s.commentOn({ from: 0, to: 5 }, 'ü'.repeat(524_289)); await f.advance(5000)
    expect(f.api.save).not.toHaveBeenCalled()
    expect(f.head().status).toBe('Your review is over 1 MB and cannot be saved; shorten some comments.')
    expect(f.store.read(key)?.dirty).toBe(true)
  })
  it.each(sentences)('shows the sentence for save refusal %s %s', async (status, error, sentence) => {
    const f = fakes(); const s = new ReviewSession(f.ports); await s.start(); await s.setName('Ada')
    f.api.save.mockResolvedValue({ status, error }); f.editor.replace({ from: 6, to: 10, insert: 'blue' }); await f.advance(5000)
    expect(f.head().status).toBe(sentence)
    if ([403, 404, 410].includes(status)) expect(f.head().editable).toBe(false)
  })
  it.each(sentences)('shows the sentence for open refusal %s %s', async (status, error, sentence) => {
    const f = fakes(); f.store.remember(key); f.store.write(key, backup(true)); f.api.open.mockResolvedValue({ status, error })
    const s = new ReviewSession(f.ports); await s.start(); expect(f.head().status).toBe(sentence)
  })
})
