import { describe, expect, it, vi } from 'vitest'
import { ReviewSession } from '../../src/app/session'
import { fakes } from './fakes'

const key = 'Abcdef1234567890'
const address = 'https://example.invalid/r/synthetic?view=review#old'
function setup(fragment = '') {
  const f = fakes(), setLink = vi.fn()
  const s = new ReviewSession({ ...f.ports, panel: { ...f.panel, setLink } }, { address, fragment })
  return { f, s, setLink }
}
describe('review link', () => {
  it('waits for a successful save and copies the address with the key', async () => {
    const { f, s, setLink } = setup()
    await s.start(); await s.setName('Ada')
    expect(setLink.mock.lastCall?.[0]).toBeNull()
    f.api.save.mockResolvedValueOnce(f.failure)
    f.editor.replace({ from: 6, to: 10, insert: 'bright' }); await f.advance(5000)
    expect(setLink.mock.lastCall?.[0]).toBeNull()
    f.editor.replace({ from: 6, to: 12, insert: 'brighter' }); await f.advance(5000)
    const url = `https://example.invalid/r/synthetic?view=review#${key}`
    expect(setLink.mock.lastCall?.[0]).toEqual({ url, message: '' })
    await s.copyReviewLink()
    expect(f.clipboard.write).toHaveBeenCalledExactlyOnceWith(url)
    expect(setLink.mock.lastCall?.[0].message).toBe('Link copied.')
    f.clipboard.write.mockResolvedValue(false); await s.copyReviewLink()
    expect(setLink.mock.lastCall?.[0].message).toBe('Copy failed; select the link and copy it.')
  })
  it('opens a valid fragment over the remembered key, fills the name, and remembers it', async () => {
    const { f, s, setLink } = setup(`#${key}`)
    f.store.remember('OtherKey12345678')
    f.api.open.mockResolvedValue({ review: { format: 1, revision: 3, name: 'Grace', draft: { file: 'draft.txt', etag: 'v1' }, sent: false, sentAt: null, updatedAt: f.clock.now(), items: [] }, revision: 3 })
    await s.start()
    expect(f.api.open).toHaveBeenCalledExactlyOnceWith(key)
    expect(f.head().name).toBe('Grace'); expect(f.store.rememberedKey()).toBe(key)
    expect(setLink.mock.lastCall?.[0].url).toBe(`https://example.invalid/r/synthetic?view=review#${key}`)
  })
  it.each(['#short', '#Abcdef123456789!', '#Abcdef12345678900', '#%41bcdef1234567890'])('ignores invalid fragment %s', async fragment => {
    const { f, s, setLink } = setup(fragment); await s.start()
    expect(setLink.mock.lastCall?.[0]).toBeNull()
    expect(f.api.open).not.toHaveBeenCalled(); expect(f.store.remember).not.toHaveBeenCalled()
  })
  it('opens an unknown fragment without exposing a link until saved', async () => {
    const { f, s, setLink } = setup(`#${key}`); await s.start()
    expect(f.api.open).toHaveBeenCalledWith(key)
    expect(f.head()).toMatchObject({ name: '', editable: false })
    expect(f.store.rememberedKey()).toBe(key)
    expect(setLink.mock.lastCall?.[0]).toBeNull()
  })
  it.each([403, 404, 410])('hides the confirmed link after a save is refused with %s (P2)', async status => {
    const { f, s, setLink } = setup()
    await s.start(); await s.setName('Ada')
    s.setOverall('Synthetic note'); await f.advance(5000)
    expect(setLink.mock.lastCall?.[0]?.url).toContain(`#${key}`)
    f.api.save.mockResolvedValueOnce({ status, error: 'refused' })
    s.setOverall('Revised synthetic note'); await f.advance(5000)
    expect(f.head().editable).toBe(false)
    expect(setLink.mock.lastCall?.[0]).toBeNull()
  })
  it.each([403, 404, 410].flatMap(status => [false, true].map(fragment => ({ status, fragment }))))('hides a saved backup link when open is refused: %o', async ({ status, fragment }) => {
    const { f, s, setLink } = setup(fragment ? `#${key}` : '')
    f.store.remember(key)
    f.store.write(key, {
      review: JSON.stringify({ format: 1, revision: 1, name: 'Ada', draft: { file: 'draft.txt', etag: 'v1' }, sent: false, sentAt: null, updatedAt: f.clock.now(), items: [] }),
      revision: 1, saved: true, dirty: false, pending: null, refusal: null, at: f.clock.now(),
    })
    f.api.open.mockResolvedValue({ status, error: 'refused' })
    await s.start()
    expect(f.api.open).toHaveBeenCalledWith(key)
    expect(f.head().editable).toBe(false)
    expect(setLink.mock.lastCall?.[0]).toBeNull()
  })
  it('hides the link when an opened review has an invalid format (P3)', async () => {
    const { f, s, setLink } = setup(`#${key}`)
    f.api.open.mockResolvedValue({ review: { format: 999 }, revision: 1 })
    await s.start()
    expect(f.head().status).not.toBe('')
    expect(f.head().editable).toBe(false)
    expect(setLink.mock.lastCall?.[0]).toBeNull()
  })
  it('clears the clipboard message on the next change and keeps it clear after saving', async () => {
    const { f, s, setLink } = setup()
    await s.start(); await s.setName('Ada')
    s.setOverall('Synthetic note'); await f.advance(5000)
    await s.copyReviewLink()
    expect(setLink.mock.lastCall?.[0]?.message).toBe('Link copied.')
    s.setOverall('Revised synthetic note')
    expect(setLink.mock.lastCall?.[0]?.message).toBe('')
    await f.advance(5000)
    expect(setLink.mock.lastCall?.[0]?.message).toBe('')
  })

})
