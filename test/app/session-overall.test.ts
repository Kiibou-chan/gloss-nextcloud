import { describe, expect, it } from 'vitest'
import { ReviewSession } from '../../src/app/session'
import { fakes } from './fakes'

async function setup(reviewable = true) {
  const f = fakes()
  const session = new ReviewSession({ ...f.ports, reviewable })
  await session.start()
  await session.setName('Ada')
  return { f, session }
}
function backup(f: ReturnType<typeof fakes>) {
  return JSON.parse(f.store.read('Abcdef1234567890')!.review)
}

describe('overall comment', () => {
  it('creates and updates one item with a stable id, the latest time, and a dirty backup', async () => {
    const { f, session } = await setup()
    session.setOverall('A synthetic overall comment.')
    await f.advance(300)
    const first = backup(f).items[0]
    expect(first).toEqual({ kind: 'overall', id: '0000000001', text: 'A synthetic overall comment.', at: f.clock.now() })
    expect(f.store.read('Abcdef1234567890')!.dirty).toBe(true)
    f.clock.now = () => '2026-11-15T20:01:00.000Z'
    session.setOverall('  A revised comment.\nWith another line.  ')
    await f.advance(300)
    expect(backup(f).items).toEqual([{ ...first, text: '  A revised comment.\nWith another line.  ', at: f.clock.now() }])
    expect(backup(f).updatedAt).toBe(f.clock.now())
    expect(f.panel.setOverallView).toHaveBeenLastCalledWith('  A revised comment.\nWith another line.  ')
    await f.advance(5000)
    expect(JSON.parse(f.api.save.mock.lastCall![1]).items).toEqual(backup(f).items)
  })
  it('removes an empty or whitespace-only comment and disables Send again', async () => {
    for (const empty of ['', ' \n ']) {
      const { f, session } = await setup()
      session.setOverall('Synthetic note')
      session.setOverall(empty)
      expect(backup(f).items).toEqual([])
      expect(f.head().canSend).toBe(false)
      expect(f.panel.setOverallView).toHaveBeenLastCalledWith(empty)
      await session.send()
      expect(f.api.save).not.toHaveBeenCalled()
      await f.advance(5000)
      expect(JSON.parse(f.api.save.mock.lastCall![1]).items).toEqual([])
      expect(f.panel.setOverallView).toHaveBeenLastCalledWith(empty)
    }
  })
  it('sends an overall-only review without changing the count or making cards', async () => {
    const { f, session } = await setup()
    session.setOverall('Synthetic note')
    expect(f.head().canSend).toBe(true)
    expect(f.panel.setCount).not.toHaveBeenCalled()
    expect(f.panel.upsertCard).not.toHaveBeenCalled()
    await session.send()
    const sent = JSON.parse(f.api.save.mock.lastCall![1])
    expect(sent.sent).toBe(true)
    expect(sent.items).toHaveLength(1)
    expect(sent.items[0]).toMatchObject({ kind: 'overall', text: 'Synthetic note' })
    expect(f.head().editable).toBe(false)
    expect(f.head().status).toBe('Review sent. Thank you.')
    session.setOverall('Ignored after Send')
    expect(backup(f).items[0].text).toBe('Synthetic note')
  })
  it('keeps proposal and comment counts unchanged and preserves their saved items', async () => {
    const { f, session } = await setup()
    f.editor.replace({ from: 0, to: 5, insert: 'omega' })
    session.commentOn({ from: 11, to: 16 }, 'Synthetic passage note')
    const count = f.panel.setCount.mock.lastCall![0]
    session.setOverall('Synthetic overall note')
    expect(f.panel.setCount).toHaveBeenLastCalledWith(count)
    expect(count).toEqual({ changes: 1, comments: 1 })
    await session.send()
    expect(JSON.parse(f.api.save.mock.lastCall![1]).items.map((item: { kind: string }) => item.kind).sort()).toEqual(['comment', 'overall', 'proposal'])
  })
  it('restores overall text before panel mounting and retains its id when edited', async () => {
    const { f, session } = await setup()
    session.setOverall('Restored synthetic note')
    await f.advance(300)
    const first = backup(f).items[0]
    session.dispose()
    const reopened = new ReviewSession(f.ports)
    await reopened.start()
    expect(f.panel.setOverallView).toHaveBeenLastCalledWith('Restored synthetic note')
    reopened.setOverall('Updated restored note')
    await f.advance(300)
    expect(backup(f).items).toEqual([{ ...first, text: 'Updated restored note' }])
  })
  it('ignores input before a name, after disposal, and on an unreviewable link', async () => {
    const f = fakes(), session = new ReviewSession(f.ports)
    await session.start()
    expect(f.panel.setOverallView).toHaveBeenLastCalledWith('')
    session.setOverall('No name')
    expect(f.store.read('Abcdef1234567890')).toBeNull()
    const plain = await setup(false)
    plain.session.setOverall('Not reviewable')
    expect(plain.f.api.save).not.toHaveBeenCalled()
    expect(plain.f.store.read('Abcdef1234567890')).toBeNull()
    const named = await setup()
    named.session.dispose()
    named.session.setOverall('Disposed')
    expect(backup(named.f).items).toEqual([])
  })
})
