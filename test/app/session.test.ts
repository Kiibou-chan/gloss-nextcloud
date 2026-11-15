import { describe, expect, it } from 'vitest'
import { ReviewSession } from '../../src/app/session'
import { fakes } from './fakes'

async function ready(name = 'Ada') { const f = fakes(); const s = new ReviewSession(f.ports); await s.start(); await s.setName(name); return { f, s } }
const change = { from: 6, to: 10, insert: 'brighter' }

describe('ReviewSession', () => {
  it('waits for a name and honours reviewable', async () => {
    const f = fakes(); const s = new ReviewSession(f.ports); await s.start(); expect(f.editor.setEditable).toHaveBeenLastCalledWith(false)
    await s.setName('Ada'); expect(f.editor.setEditable).toHaveBeenLastCalledWith(true)
    const g = fakes(); const t = new ReviewSession({ ...g.ports, reviewable: false }); await t.start(); await t.setName('Ada'); expect(g.editor.setEditable).toHaveBeenLastCalledWith(false)
  })
  it.each([['Éva Smith', 'e-va-smith'], [' A & B ', 'a-b'], ['中文', 'reviewer'], ['A'.repeat(70), 'a'.repeat(60)]])('uses the spike slug for %s', async (name, slug) => {
    const { f, s } = await ready(name); expect(f.api.open).toHaveBeenLastCalledWith(`${slug}-Abcdef1234567890`)
    await s.setName('Other'); expect(f.store.rememberedKey()).toBe('other-Abcdef1234567890')
  })
  it('renders typing, singular counts, and only changed cards', async () => {
    const { f } = await ready(); f.editor.replace(change)
    expect(f.editor.setMarks.mock.lastCall![0]).toEqual([expect.objectContaining({ from: 6, to: 14 })])
    expect(f.editor.setMarks.mock.lastCall![1]).toEqual([expect.objectContaining({ text: 'beta' })])
    expect(f.head().countText).toBe('1 change, 0 comments')
    f.editor.replace({ from: 21, to: 26, insert: 'last' }); f.panel.upsertCard.mockClear(); f.panel.setOrder.mockClear()
    f.editor.replace({ from: 6, to: 14, insert: 'bright' })
    expect(f.panel.upsertCard).toHaveBeenCalledTimes(1); expect(f.panel.setOrder).not.toHaveBeenCalled()
    expect(f.editor.text).not.toHaveBeenCalled()
  })
  it('maps selections to proposals and plain targets without focusing', async () => {
    const { f } = await ready(); f.editor.replace(change); f.select(7, 12)
    expect(f.head().form).toMatchObject({ target: { id: expect.any(String) }, focus: false })
    f.select(0, 5); expect(f.head().form).toEqual({ target: { from: 0, to: 5 }, focus: false })
  })
  it('places PDF selections, focuses, scrolls, and reports misses', async () => {
    const { f } = await ready(); f.pdfSelect('beta')
    expect(f.head().form).toEqual({ target: { from: 6, to: 10 }, focus: true }); expect(f.editor.scrollTo).toHaveBeenLastCalledWith(6)
    f.pdfSelect('absent'); expect(f.head().status).toBe('That selection could not be placed in the draft. Select a little more, or use the editor.')
  })
  it('adds multiple comments, removes the last note, and orders cards', async () => {
    const { f, s } = await ready(); s.commentOn({ from: 11, to: 16 }, 'one'); const id = f.panel.upsertCard.mock.lastCall![0].id
    s.commentOn({ id }, 'two'); expect(f.panel.upsertCard.mock.lastCall![0].comments).toHaveLength(2)
    s.commentOn({ from: 0, to: 5 }, 'first'); expect(f.panel.setOrder.mock.lastCall![0][1]).toBe(id)
    s.deleteComment(id, 0); s.deleteComment(id, 0); expect(f.panel.removeCard).toHaveBeenCalledWith(id)
    expect(f.head().countText).toBe('0 changes, 1 comment')
  })
  it('undoes through an editor replacement and keeps proposal comments', async () => {
    const { f, s } = await ready(); f.editor.replace(change); const id = f.panel.upsertCard.mock.lastCall![0].id
    s.commentOn({ id }, 'explain'); s.undoProposal(id)
    expect(f.editor.replace).toHaveBeenLastCalledWith({ from: 6, to: 14, insert: 'beta' })
    expect(f.panel.upsertCard.mock.lastCall![0]).toMatchObject({ id, kind: 'comment' })
    s.focusItem(id); expect(f.editor.scrollTo).toHaveBeenLastCalledWith(6); expect(f.pdf.scrollToMark).toHaveBeenLastCalledWith(id)
  })
  it('remembers the view, loads PDF once, and debounces visible marks', async () => {
    const { f, s } = await ready(); f.editor.replace(change); await f.advance(400); expect(f.pdf.setMarks).not.toHaveBeenCalled()
    await s.setView('both'); expect(f.store.setView).toHaveBeenLastCalledWith('both'); await f.advance(399); expect(f.pdf.setMarks).not.toHaveBeenCalled(); await f.advance(1)
    expect(f.pdf.setMarks).toHaveBeenCalledTimes(1); f.pdf.setMarks.mockClear()
    f.editor.replace({ from: 6, to: 14, insert: 'bright' }); await f.advance(200); f.editor.replace({ from: 6, to: 12, insert: 'blue' }); await f.advance(399); expect(f.pdf.setMarks).not.toHaveBeenCalled(); await f.advance(1); expect(f.pdf.setMarks).toHaveBeenCalledTimes(1)
    await s.setView('editor'); await s.setView('pdf'); expect(f.pdf.show).toHaveBeenCalledTimes(1)
  })
  it('restores the remembered view', async () => { const f = fakes(); f.store.setView('pdf'); const s = new ReviewSession(f.ports); await s.start(); expect(f.pdf.show).toHaveBeenCalledTimes(1) })
  it('saves after 600 ms and reconciles drift before serialising', async () => {
    const { f } = await ready(); f.editor.replace(change); await f.advance(599); expect(f.api.save).not.toHaveBeenCalled()
    f.drift('alpha blue gamma delta'); await f.advance(1); const record = JSON.parse(f.api.save.mock.lastCall![1]); expect(record.items[0].proposal).toBe('blue'); expect(f.editor.text).toHaveBeenCalledTimes(1)
    expect(f.head().status).toBe('Saved')
    expect(f.diagnostic).toHaveBeenCalledWith('The editor and review differed; the review was rebuilt.')
  })
  it('sends immediately, stops edits, and restores editing on refusal', async () => {
    const { f, s } = await ready(); f.editor.replace(change); await s.send(); expect(f.api.save).toHaveBeenCalledTimes(1); expect(JSON.parse(f.api.save.mock.lastCall![1]).sent).toBe(true)
    expect(f.editor.setEditable).toHaveBeenLastCalledWith(false); expect(f.head().status).toBe('Review sent. Thank you.')
    const { f: g, s: t } = await ready(); g.editor.replace(change); g.api.save.mockResolvedValue({ status: 413, error: 'tooLarge' }); await t.send(); expect(g.editor.setEditable).toHaveBeenLastCalledWith(true); expect(g.head().status).toContain('Not sent:')
    await g.advance(1000); expect(g.api.save).toHaveBeenCalledTimes(1)
  })
  it('opens, places saved items, and reports lost quotes', async () => {
    const f = fakes(); f.api.open.mockResolvedValue({ review: { name: 'Ada', draft: 'draft.txt', sent: true, items: [
      { kind: 'proposal', from: 0, quote: { exact: 'beta', prefix: '', suffix: '' }, proposal: 'blue', comments: [], at: f.clock.now() },
      { kind: 'comment', from: 0, quote: { exact: 'missing', prefix: '', suffix: '' }, comments: [{ text: 'lost', at: f.clock.now() }], at: f.clock.now() },
    ] }, revision: 0 }); const s = new ReviewSession(f.ports); await s.start(); await s.setName('Ada')
    expect(f.editor.setText).toHaveBeenLastCalledWith('alpha blue gamma delta'); expect(f.head().status).toBe('1 of your earlier items no longer match the draft.'); expect(f.editor.setEditable).toHaveBeenLastCalledWith(false)
  })
  it('can save again after a non-retried refusal', async () => {
    const { f } = await ready(); f.api.save.mockResolvedValueOnce({ status: 400, error: 'badReview' }); f.editor.replace(change); await f.advance(600)
    f.editor.replace({ from: 6, to: 14, insert: 'blue' }); await f.advance(600); expect(f.api.save).toHaveBeenCalledTimes(2); expect(f.head().status).toBe('Saved')
  })
  it('hides the PDF switch and ignores PDF modes without a PDF', async () => {
    const f = fakes(); const s = new ReviewSession({ ...f.ports, hasPdf: false }); f.store.setView('both'); await s.start(); await s.setView('pdf')
    expect(f.head()).toMatchObject({ hasPdf: false, view: 'editor' }); expect(f.pdf.show).not.toHaveBeenCalled()
  })
  it('sorts loaded cards in draft order rather than saved order', async () => {
    const f = fakes(); f.api.open.mockResolvedValue({ review: { name: 'Ada', draft: 'draft.txt', sent: false, items: [
      { kind: 'comment', from: 11, quote: { exact: 'gamma', prefix: '', suffix: '' }, comments: [{ text: 'later', at: f.clock.now() }], at: f.clock.now() },
      { kind: 'comment', from: 0, quote: { exact: 'alpha', prefix: '', suffix: '' }, comments: [{ text: 'first', at: f.clock.now() }], at: f.clock.now() },
    ] }, revision: 0 }); const s = new ReviewSession(f.ports); await s.start(); await s.setName('Ada')
    const ordered = f.panel.setOrder.mock.lastCall![0]; const cards = f.panel.upsertCard.mock.calls.map(c => c[0]); expect(ordered.map(id => cards.find(c => c.id === id)!.from)).toEqual([0, 11])
  })
  it('keeps Send read-only while a previous save finishes', async () => {
    const { f, s } = await ready(); let resolve!: (v: { revision: number }) => void
    f.api.save.mockImplementationOnce(() => new Promise(r => { resolve = r })); f.editor.replace(change); await f.advance(600)
    let resolveSend!: (v: { revision: number }) => void
    f.api.save.mockImplementationOnce(() => new Promise(r => { resolveSend = r }))
    const sending = s.send(); expect(f.editor.setEditable).toHaveBeenLastCalledWith(false)
    resolve({ revision: 1 }); for (let i = 0; i < 6; i++) await Promise.resolve()
    expect(f.head().status).toBe('Sending…'); resolveSend({ revision: 2 }); await sending
    expect(f.api.save).toHaveBeenCalledTimes(2); expect(JSON.parse(f.api.save.mock.calls[0]![1]).sent).toBe(false); expect(JSON.parse(f.api.save.mock.calls[1]![1]).sent).toBe(true)
    expect(f.api.save.mock.calls[1]![2]).toBe(1); expect(f.head().status).toBe('Review sent. Thank you.')
  })
  it('exposes the settled future hook names', async () => { const { f, s } = await ready(); s.setOverall('later'); s.showKeptChanges(); expect(f.panel.setOverallView).toHaveBeenCalledWith('later'); expect(f.panel.setConflictView).toHaveBeenCalled() })
})
