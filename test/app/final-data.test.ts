import { expect, it } from 'vitest'
import { ReviewSession } from '../../src/app/session'
import { fakes } from './fakes'

const key = 'Abcdef1234567890', other = 'Zyxwvu9876543210'
const settle = async () => { for (let n = 0; n < 30; n++) await Promise.resolve() }
const record = (text = 'server') => ({ format: 1, revision: 1, name: 'Ada', draft: { file: 'draft.txt', etag: 'v1' }, sent: false, sentAt: null, updatedAt: '2026-11-15T20:00:00Z', items: [{ id: '0000000001', kind: 'overall', text, at: '2026-11-15T20:00:00Z' }] })

it.each([400, 403, 404, 410, 413, 429])('I1 reload opens again and resumes dirty changes after %i', async status => {
  const f = fakes(), s = new ReviewSession(f.ports); await s.start(); await s.setName('Ada')
  f.api.save.mockResolvedValue({ status, error: 'refused' }); s.setOverall('waiting'); await f.advance(60000); await settle()
  expect(f.api.save).toHaveBeenCalledTimes(1); s.online(); await settle(); expect(f.api.save).toHaveBeenCalledTimes(1)
  expect(f.store.read(key)).not.toHaveProperty('refusal'); s.dispose()
  f.api.save.mockResolvedValue({ revision: 1 }); f.api.save.mockClear()
  const t = new ReviewSession({ ...f.ports, reviewable: true }); await t.start(); expect(f.api.open).toHaveBeenCalledWith(key)
  await f.advance(60000); await settle(); expect(f.api.save).toHaveBeenCalledTimes(1)
  t.setOverall('editing works'); await f.advance(5000); await settle(); expect(JSON.parse(f.api.save.mock.lastCall![1]).items[0].text).toBe('editing works'); t.dispose()
})
it('I2 two tabs before first save reload the server copy and keep the losing changes', async () => {
  const a = fakes(), b = fakes(); b.ports.store = a.store
  let server: ReturnType<typeof record> | null = null
  const save = async (_key: string, body: string, base: number) => {
    if (base !== (server?.revision ?? 0)) return { status: 409, error: 'conflict' }
    server = JSON.parse(body); return { revision: server!.revision }
  }
  a.api.save.mockImplementation(save); b.api.save.mockImplementation(save)
  b.api.open.mockImplementation(async () => server ? { review: server, revision: server.revision } : { review: null })
  const first = new ReviewSession(a.ports); await first.start(); await first.setName('Ada')
  const second = new ReviewSession(b.ports); await second.start()
  first.setOverall('winning tab'); await a.advance(5000); await settle()
  second.setOverall('losing tab'); await b.advance(5000); await settle(); second.dispose()
  expect(a.store.read(key)?.saved).toBe(true)
  const third = new ReviewSession(b.ports); await third.start()
  expect(b.api.open).toHaveBeenCalledTimes(2); expect(b.panel.setOverallView).toHaveBeenLastCalledWith('winning tab')
  expect(a.store.keepConflict).toHaveBeenCalledWith(key, expect.objectContaining({ review: expect.stringContaining('losing tab') }))
  third.setOverall('continued'); await b.advance(5000); await settle(); expect(server!.items[0]!.text).toBe('continued'); first.dispose(); third.dispose()
})
it('M1 preserves the dirty remembered review when opening another fragment', async () => {
  const f = fakes(), s = new ReviewSession(f.ports); await s.start(); await s.setName('Ada'); s.setOverall('waiting'); await f.advance(300); s.dispose()
  const backup = f.store.read(key)
  f.api.open.mockResolvedValue({ review: record(), revision: 1 })
  const t = new ReviewSession(f.ports, { address: '', fragment: '#' + other }); await t.start()
  expect(f.store.rememberedKey()).toBe(key); expect(f.store.read(key)).toBe(backup)
  expect(f.head().status).toBe("Changes for another review in this browser are still waiting; open that review's link to continue."); t.dispose()
})
it.each([false, true])('M2 restores a missing review from backup and saves revision 1 over base 0 (dirty %s)', async dirty => {
  const f = fakes(); f.store.remember(key); f.store.write(key, { review: JSON.stringify({ ...record('retained'), revision: 7 }), revision: 7, saved: true, dirty, pending: null, at: 'then' })
  const s = new ReviewSession(f.ports); await s.start(); await f.advance(5000); await settle()
  expect(f.panel.setOverallView).toHaveBeenLastCalledWith('retained'); expect(f.api.save.mock.lastCall![2]).toBe(0)
  expect(JSON.parse(f.api.save.mock.lastCall![1]).revision).toBe(1); s.dispose()
})
it('M3 pagehide duplicates the immutable in-flight bytes with keepalive', async () => {
  const f = fakes(), s = new ReviewSession(f.ports); await s.start(); await s.setName('Ada')
  f.api.save.mockImplementation(() => new Promise(() => {})); s.setOverall('pending'); await f.advance(5000)
  const request = f.api.save.mock.lastCall!; s.setOverall('later'); s.pagehide()
  expect(f.api.save).toHaveBeenLastCalledWith(request[0], request[1], request[2], { keepalive: true }); expect(f.api.save).toHaveBeenCalledTimes(2); s.dispose()
})
