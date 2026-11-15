import { describe, expect, it, vi } from 'vitest'
import { ReviewSession } from '../../src/app/session'
import type { Backup } from '../../src/app/ports'
import { fakes } from './fakes'
import protocol from '../fixtures/save-protocol.json'

const key = 'Abcdef1234567890'
const settle = async () => { for (let i = 0; i < 24; i++) await Promise.resolve() }
async function ready() { const f = fakes(); const s = new ReviewSession(f.ports); await s.start(); await s.setName('Ada'); return { f, s } }
const edit = { from: 6, to: 10, insert: 'blue' }
function fixtureBackup(revision = 1): Backup {
  const row = protocol[1]!; const body = JSON.stringify({ ...JSON.parse(row.request.review), revision, draft: { file: 'draft.txt', etag: 'v1' } })
  return { review: body, revision, pending: null, saved: true, dirty: true, at: '2026-11-15T12:00:00Z' }
}
describe('session backup and recovery', () => {
  it('backs up after 300 ms and asks about leaving only while dirty', async () => {
    const { f, s } = await ready(); expect(s.dirty).toBe(false); f.editor.replace(edit)
    await f.advance(299); expect(f.store.read(key)?.dirty).toBe(false); expect(s.dirty).toBe(true)
    await f.advance(1); expect(f.store.read(key)?.dirty).toBe(true); await f.advance(4700); await settle(); expect(s.dirty).toBe(false)
  })
  it('writes pending before keepalive; a landed page-close save reloads as Saved without conflict', async () => {
    const { f, s } = await ready(); let body = ''
    f.api.save.mockImplementation(async (_key, incoming) => { expect(f.store.read(key)?.pending?.body).toBe(incoming); body = incoming; return { revision: 1 } })
    f.editor.replace(edit); s.pagehide(); s.dispose(); await settle()
    const b = f.store.read(key)!; const g = fakes(); g.store.remember(key); g.store.write(key, b)
    g.api.open.mockResolvedValue({ review: JSON.parse(body), revision: 1 })
    const t = new ReviewSession(g.ports); await t.start(); await settle()
    expect(g.head().status).toBe('Saved'); expect(g.store.keepConflict).not.toHaveBeenCalled(); expect(g.editor.text()).toBe('alpha blue gamma delta')
  })
  it('sends nothing on pagehide during an in-flight save; reload resends its body and lands by row 4', async () => {
    const { f, s } = await ready(); f.api.save.mockImplementation(() => new Promise(() => {})); f.editor.replace(edit); await f.advance(5000)
    const incoming = f.api.save.mock.lastCall![1]; s.pagehide(); expect(f.api.save).toHaveBeenCalledTimes(1); const b = f.store.read(key)!; expect(b.pending?.body).toBe(incoming); s.dispose()
    const g = fakes(); g.store.remember(key); g.store.write(key, b)
    g.api.save.mockImplementation(async (_key, body, base) => { expect(body).toBe(incoming); expect(base).toBe(0); expect(JSON.parse(body).revision).toBe(1); expect(protocol[3]!.expected.written).toBe(false); return { revision: 1 } })
    const t = new ReviewSession(g.ports); await t.start(); await settle(); expect(g.api.open).not.toHaveBeenCalled(); expect(g.api.save).toHaveBeenCalledTimes(1); expect(g.head().status).toBe('Saved')
  })
  it.each(['equal', 'pending', 'conflict'] as const)('restores by revision: %s', async mode => {
    const f = fakes(); const b = fixtureBackup(mode === 'equal' ? 2 : 1); if (mode === 'pending') b.pending = { body: fixtureBackup(2).review, revision: 1 }
    f.store.remember(key); f.store.write(key, b); f.api.open.mockResolvedValue({ review: JSON.parse(fixtureBackup(2).review), revision: 2 })
    const s = new ReviewSession(f.ports); await s.start(); await settle()
    if (mode === 'conflict') { expect(f.store.keepConflict).toHaveBeenCalledWith(key, b); expect(f.head().status).toContain('were not restored'); s.showKeptChanges(); expect(f.panel.setConflictView).toHaveBeenCalled() }
    else { expect(f.store.keepConflict).not.toHaveBeenCalled(); if (mode === 'pending') expect(f.api.save).toHaveBeenCalled(); else expect(f.head().name).toBe('Ada Lovelace') }
  })
  it('adds the full-storage warning while still saving', async () => {
    const { f, s } = await ready(); vi.spyOn(f.store, 'write').mockImplementation(() => false as true); f.editor.replace(edit); await f.advance(5000); await settle()
    expect(f.head().status).toContain('Not backed up in this browser.'); expect(f.api.save).toHaveBeenCalledTimes(1); expect(s.dirty).toBe(false)
  })
  it('clears refused pending data so reload does not resend a 413', async () => {
    const { f, s } = await ready(); f.editor.replace(edit); await f.advance(5000); await settle(); f.api.save.mockClear(); f.api.open.mockResolvedValue({ review: JSON.parse(f.store.read(key)!.review), revision: 1 }); f.api.save.mockResolvedValue({ status: 413, error: 'tooLarge' }); f.editor.replace(edit); await f.advance(5000); await settle()
    expect(f.store.read(key)?.pending).toBeNull(); s.dispose(); const t = new ReviewSession(f.ports); await t.start(); await settle(); expect(f.api.save).toHaveBeenCalledTimes(1)
    f.api.save.mockResolvedValue({ revision: 1 }); f.editor.replace({ from: 6, to: 10, insert: 'x' }); await f.advance(5000); await settle(); expect(f.api.save.mock.lastCall![2]).toBe(1)
  })
  it('keeps the key and edits when renaming during and before saves, and pauses for a blank name', async () => {
    const { f, s } = await ready(); f.editor.replace(edit); await s.setName('Bob'); await f.advance(5000); await settle()
    expect(JSON.parse(f.api.save.mock.lastCall![1])).toMatchObject({ name: 'Bob', items: [expect.objectContaining({ proposal: 'blue' })] })
    let land!: (v: { revision: number }) => void; f.api.save.mockImplementationOnce(() => new Promise(r => { land = r })); f.editor.replace({ from: 6, to: 10, insert: 'green' }); await f.advance(5000); await s.setName('Carol'); await f.advance(5000)
    land({ revision: 2 }); await settle(); expect(f.api.save.mock.lastCall![0]).toBe(key); expect(JSON.parse(f.api.save.mock.lastCall![1])).toMatchObject({ name: 'Carol', items: [expect.objectContaining({ proposal: 'green' })] })
    await s.setName(''); expect(f.head()).toMatchObject({ name: '', editable: false, canSend: false }); const count = f.api.save.mock.calls.length; await f.advance(5000); expect(f.api.save).toHaveBeenCalledTimes(count)
    await s.setName('Ada'); await f.advance(5000); await settle(); expect(f.api.save.mock.lastCall![0]).toBe(key)
  })
})

it('retains edits across reload while a blank name pauses saving', async () => {
  const { f, s } = await ready(); f.editor.replace(edit); await s.setName(''); await f.advance(5000)
  expect(f.api.save).not.toHaveBeenCalled(); expect(f.head().name).toBe(''); s.pagehide(); s.dispose()
  const g = fakes(); g.store.remember(key); g.store.write(key, f.store.read(key)!)
  const t = new ReviewSession(g.ports); await t.start()
  expect(g.head().name).toBe('Ada'); expect(g.editor.text()).toBe('alpha blue gamma delta'); t.dispose()
})
it('offers read-only kept changes immediately after a live conflict', async () => {
  const { f, s } = await ready(); f.api.save.mockResolvedValue({ status: 409, error: 'conflict' }); f.editor.replace(edit); await f.advance(5000); await settle()
  expect(f.store.keepConflict).toHaveBeenCalledWith(key, expect.objectContaining({ dirty: true }))
  expect(f.panel.setConflictView).toHaveBeenLastCalledWith(expect.objectContaining({ show: false, text: expect.stringContaining('blue') }))
  s.showKeptChanges(); expect(f.panel.setConflictView).toHaveBeenLastCalledWith(expect.objectContaining({ show: true, text: expect.stringContaining('beta') }))
})
it('ignores a clean backup and displays the server review', async () => {
  const f = fakes(); const b = fixtureBackup(1); b.dirty = false; b.review = 'invalid clean backup that must not be parsed'; f.store.remember(key); f.store.write(key, b)
  f.api.open.mockResolvedValue({ review: JSON.parse(fixtureBackup(2).review), revision: 2 }); const s = new ReviewSession(f.ports); await s.start()
  expect(f.head().name).toBe('Ada Lovelace'); expect(f.api.save).not.toHaveBeenCalled(); expect(f.store.keepConflict).not.toHaveBeenCalled(); s.dispose()
})
