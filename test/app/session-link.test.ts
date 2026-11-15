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
})
