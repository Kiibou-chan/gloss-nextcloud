import { describe, expect, it } from 'vitest'
import { ReviewSession } from '../../src/app/session'
import { fakes } from './fakes'
const settle = async () => { for (let i = 0; i < 24; i++) await Promise.resolve() }
async function ready() { const f = fakes(); const s = new ReviewSession(f.ports); await s.start(); await s.setName('Ada'); f.editor.replace({ from: 6, to: 10, insert: 'blue' }); return { f, s } }
describe('Send through the save queue', () => {
  it('flushes the debounce once and never sends twice', async () => { const { f, s } = await ready(); await s.send(); await f.advance(10000); expect(f.api.save).toHaveBeenCalledTimes(1); expect(f.head().status).toBe('Review sent. Thank you.'); expect(f.head().editable).toBe(false) })
  it('queues Send once behind a save and advances its revision', async () => {
    const { f, s } = await ready(); let land!: (v: { revision: number }) => void; f.api.save.mockImplementationOnce(() => new Promise(r => { land = r })); await f.advance(5000)
    const sent = s.send(); await f.advance(5000); land({ revision: 1 }); await sent; await settle(); await f.advance(10000)
    expect(f.api.save).toHaveBeenCalledTimes(2); expect(f.api.save.mock.calls[1]![2]).toBe(1); expect(JSON.parse(f.api.save.mock.calls[1]![1]).sent).toBe(true); expect(f.head().status).toBe('Review sent. Thank you.')
  })
  it('clears sent on refusal and allows editing', async () => { const { f, s } = await ready(); f.api.save.mockResolvedValueOnce({ status: 413, error: 'tooLarge' }); await s.send(); expect(f.head().editable).toBe(true); expect(f.store.read('Abcdef1234567890')?.review).toContain('"sent":false') })
  it('keeps sent while retrying the identical Send after a lost answer', async () => { const { f, s } = await ready(); f.api.save.mockResolvedValueOnce({ status: 0, error: 'network' }); await s.send(); const body = f.api.save.mock.lastCall![1]; expect(f.head().status).toBe('Not sent yet; trying again in 2 s'); expect(f.head().editable).toBe(false); await f.advance(2000); await settle(); expect(f.api.save.mock.lastCall![1]).toBe(body); expect(f.head().status).toBe('Review sent. Thank you.') })
})
