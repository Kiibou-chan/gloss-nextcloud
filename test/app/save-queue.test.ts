import { describe, expect, it, vi } from 'vitest'
import { SaveQueue } from '../../src/app/save-queue'
import { createReviewApi } from '../../src/adapters/http/review-api'
import protocol from '../fixtures/save-protocol.json'
import { fakes } from './fakes'

const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
function setup() {
  const f = fakes(); let text = 'first'; const statuses: string[] = []
  const save = vi.fn(async (_body: string, base: number, _options?: { keepalive?: boolean }) => ({ revision: base + 1 } as { revision: number } | { status: number; error: string }))
  const q = new SaveQueue({ save, scheduler: f.scheduler, body: revision => JSON.stringify({ revision, text }), onStatus: status => statuses.push(status) })
  return { f, q, save, statuses, change: (value: string) => { text = value; q.changed() } }
}
describe('SaveQueue', () => {
  it('debounces a burst for five seconds and stays dirty until the final body lands', async () => {
    const x = setup(); x.change('a'); await x.f.advance(4000); x.change('b'); await x.f.advance(4999)
    expect(x.save).not.toHaveBeenCalled(); expect(x.q.dirty).toBe(true)
    await x.f.advance(1); await settle(); expect(x.save).toHaveBeenCalledTimes(1); expect(x.q.dirty).toBe(false); expect(x.statuses.at(-1)).toBe('Saved')
  })
  it('serialises changes behind an in-flight request with the next base revision', async () => {
    const x = setup(); let land!: (v: { revision: number }) => void
    x.save.mockImplementationOnce(() => new Promise(r => { land = r })); x.change('a'); await x.f.advance(5000)
    x.change('b'); await x.f.advance(5000); expect(x.save).toHaveBeenCalledTimes(1)
    land({ revision: 1 }); await settle(); expect(x.save).toHaveBeenCalledTimes(2)
    expect(x.save.mock.calls[1]!.slice(0, 2)).toEqual([JSON.stringify({ revision: 2, text: 'b' }), 1]); expect(x.q.dirty).toBe(false)
  })
  it('retries identical bytes at 2, 5, 15, and 15 seconds, and immediately online', async () => {
    const x = setup(); x.save.mockResolvedValue({ status: 0, error: 'network' }); x.change('a'); await x.q.flush()
    const pending = x.q.pending
    for (const delay of [2000, 5000, 15000, 15000]) { await x.f.advance(delay - 1); const count = x.save.mock.calls.length; await x.f.advance(1); await settle(); expect(x.save).toHaveBeenCalledTimes(count + 1); expect(x.q.pending).toEqual(pending) }
    x.q.online(); await settle(); expect(x.save).toHaveBeenCalledTimes(6)
    expect(x.statuses).toContain('Not saved yet; trying again in 2 s')
  })
  it.each([400, 403, 404, 409, 410, 412, 413, 429])('stops on %s and clears pending but keeps dirty data', async status => {
    const x = setup(); x.save.mockResolvedValueOnce({ status, error: 'refused' }); x.change('long'); await x.q.flush()
    expect(x.q.pending).toBeNull(); expect(x.q.dirty).toBe(true); await x.f.advance(60000); x.q.online(); await settle(); expect(x.save).toHaveBeenCalledTimes(1)
    x.change('short'); await x.q.flush(); expect(x.save.mock.lastCall![1]).toBe(0); expect(x.q.dirty).toBe(false)
  })
  it('sends keepalive only below 64 KiB and never beside an in-flight save', async () => {
    const x = setup(); x.change('small'); x.q.pagehide(); await settle(); expect(x.save.mock.lastCall![2]).toEqual({ keepalive: true })
    x.change('ü'.repeat(40000)); x.q.pagehide(); await settle(); expect(x.save).toHaveBeenCalledTimes(1)
    const y = setup(); y.save.mockImplementation(() => new Promise(() => {})); y.change('a'); void y.q.flush(); y.q.pagehide(); expect(y.save).toHaveBeenCalledTimes(1)
  })
  it.each(protocol.filter(row => row.description.startsWith('A lost')))('recovers $description from the shared protocol table', async row => {
    const initial = protocol.find(r => r.request.review === row.request.review && r.expected.written)!
    const f = fakes(); const statuses: string[] = []; let stored = initial.stored; let writes = 0; let lose = true
    const save = vi.fn(async (body: string, base: number) => {
      const entry = protocol.find(r => r.stored === stored && r.request.review === body && r.request.baseRevision === base && !r.locked)!
      expect(entry).toBeDefined(); if (entry.expected.written) { stored = body; writes++ }
      if (lose) { lose = false; return { status: 0, error: 'network' } }
      return entry.expected.status === 200 ? { revision: entry.expected.body.revision! } : { status: entry.expected.status, error: entry.expected.body.error! }
    })
    const q = new SaveQueue({ save, scheduler: f.scheduler, body: () => row.request.review, revision: row.request.baseRevision, dirty: true, onStatus: s => statuses.push(s) })
    await q.flush(); expect(q.dirty).toBe(true); await f.advance(2000); await settle(); expect(stored).toBe(row.stored); expect(writes).toBe(1); expect(save).toHaveBeenCalledTimes(2); expect(statuses.at(-1)).toBe(JSON.parse(row.request.review).sent ? 'Review sent. Thank you.' : 'Saved')
  })
  it.each([false, true])('uses one public CSRF refresh and stops after a second 412 (%s)', async twice => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 412 })).mockResolvedValueOnce(Response.json({ token: 'synthetic-fresh' })).mockResolvedValueOnce(twice ? new Response('', { status: 412 }) : Response.json({ revision: 1 }))
    vi.stubGlobal('fetch', fetcher)
    try {
      const f = fakes(); const statuses: string[] = []; const api = createReviewApi('/index.php/apps/gloss/r/synthetic', 'synthetic-old')
      const q = new SaveQueue({ save: (body, base) => api.save('Abcdef1234567890', body, base), body: () => '{}', scheduler: f.scheduler, onStatus: s => statuses.push(s) })
      q.changed(); await q.flush(); expect(fetcher.mock.calls[1]![0]).toBe('/index.php/csrftoken'); expect(fetcher.mock.calls[1]![1].method).toBe('GET')
      expect(fetcher.mock.calls[2]![1].headers).toEqual({ requesttoken: 'synthetic-fresh' }); await f.advance(60000); expect(fetcher).toHaveBeenCalledTimes(3)
      expect(statuses.at(-1)).toBe(twice ? 'Your session ended. Reload the page to continue; your changes are kept in this browser.' : 'Saved')
    } finally { vi.unstubAllGlobals() }
  })
})
it('keeps pending without requesting keepalive when URL encoding exceeds 64 KiB', async () => {
  const f = fakes(); const api = createReviewApi('/index.php/apps/gloss/r/synthetic', 'synthetic-token'); const fetcher = vi.fn().mockResolvedValue(Response.json({ revision: 1 })); vi.stubGlobal('fetch', fetcher)
  const body = JSON.stringify({ revision: 1, text: 'ü'.repeat(12000) }); expect(new TextEncoder().encode(body).length).toBeLessThan(65_536)
  try {
    const q = new SaveQueue({ body: () => body, save: (body, base, options) => api.save('Abcdef1234567890', body, base, options), scheduler: f.scheduler, onStatus: () => {} })
    q.changed(); q.pagehide(); for (let i = 0; i < 30; i++) await Promise.resolve()
    expect(fetcher).not.toHaveBeenCalled(); expect(q.pending?.body).toBe(body); expect(q.dirty).toBe(true)
  } finally { vi.unstubAllGlobals() }
})
