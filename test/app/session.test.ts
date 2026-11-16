import { describe, expect, it, vi } from 'vitest'
import { ReviewSession } from '../../src/app/session'
import { readReview } from '../../src/domain/format/read'
import { fakes } from './fakes'

async function ready(name = 'Ada') { const f = fakes(); const s = new ReviewSession(f.ports); await s.start(); await s.setName(name); return { f, s } }
function rememberSaved(f: ReturnType<typeof fakes>, key = 'KnownReview12345') {
  f.store.remember(key)
  f.store.write(key, { review: JSON.stringify({ name: 'Ada', draft: 'draft.txt', sent: false, items: [] }), pending: null, revision: 0, saved: true, dirty: false, at: f.clock.now() })
}
const change = { from: 6, to: 10, insert: 'brighter' }

describe('ReviewSession', () => {
  it.each(['x', '😀'])('accepts and saves a name of 100 code points using %s', async character => {
    const name = character.repeat(100)
    const { f } = await ready(` ${name} `)
    expect(f.head()).toMatchObject({ name, editable: true, status: '' })
    f.editor.replace(change)
    await f.advance(5000)
    const result = readReview(JSON.parse(f.api.save.mock.lastCall![1]), f.ids.item)
    expect(result).toMatchObject({ record: { name } })
  })
  it.each(['x', '😀'])('refuses a name of 101 code points using %s without losing the current review', async character => {
    const { f, s } = await ready()
    f.editor.replace(change)
    await s.setName(` ${character.repeat(101)} `)
    expect(f.head()).toMatchObject({ name: 'Ada', editable: true, status: 'Your name must be 100 characters or fewer.' })
    expect(f.api.open).not.toHaveBeenCalled()
    expect(f.store.remember).toHaveBeenCalledTimes(1)
    await f.advance(5000)
    expect(f.api.save).toHaveBeenCalledTimes(1)
    expect(JSON.parse(f.api.save.mock.lastCall![1])).toMatchObject({ name: 'Ada', items: [expect.objectContaining({ proposal: 'brighter' })] })
  })
  it('reports a comment target removed by undo while the form is open', async () => {
    const { f, s } = await ready()
    f.editor.replace(change)
    const id = f.panel.upsertCard.mock.lastCall![0].id
    s.openForm({ id })
    const target = f.head().form!.target
    s.undoProposal(id)
    await f.advance(5000)
    f.api.save.mockClear()
    s.commentOn(target, 'Please explain this change')
    expect(f.head().form?.target).toEqual(target)
    expect(f.head().status).toBe('That item no longer exists. Copy your comment before cancelling.')
    await f.advance(5000)
    expect(f.api.save).not.toHaveBeenCalled()
    expect(f.panel.setCount).toHaveBeenLastCalledWith({ changes: 0, comments: 0 })
  })
  it('shows raw Typst syntax in proposal cards', async () => {
    const f = fakes()
    f.api.draft.mockResolvedValue({ main: 'draft.typ', files: [{ file: 'draft.typ', text: '*alpha* beta', etag: 'v1' }] })
    const s = new ReviewSession(f.ports); await s.start(); await s.setName('Ada')
    f.editor.replace({ from: 0, to: 1, insert: '_' })
    expect(f.panel.upsertCard.mock.lastCall![0]).toMatchObject({ shown: '*', proposalShown: '_' })
    const g = fakes()
    g.api.draft.mockResolvedValue({ main: 'draft.txt', files: [{ file: 'draft.txt', text: 'alpha\nbeta', etag: 'v1' }] })
    const t = new ReviewSession(g.ports); await t.start(); await t.setName('Ada')
    g.editor.replace({ from: 5, to: 6, insert: '\n\n' })
    expect(g.panel.upsertCard.mock.lastCall![0]).toMatchObject({ shown: '', proposalShown: '' })
  })
  it('normalises raw card quotes and proposal whitespace', async () => {
    const f = fakes()
    f.api.draft.mockResolvedValue({ main: 'draft.typ', files: [{ file: 'draft.typ', text: '*alpha*  \n beta', etag: 'v1' }] })
    const s = new ReviewSession(f.ports); await s.start(); await s.setName('Ada')
    s.commentOn({ from: 0, to: 15 }, 'Check this')
    expect(f.panel.upsertCard.mock.lastCall![0]).toMatchObject({ shown: '*alpha* beta', proposalShown: '' })
    f.editor.replace({ from: 0, to: 15, insert: '_gamma_ \n delta' })
    expect(f.panel.upsertCard.mock.lastCall![0]).toMatchObject({ shown: '*alpha* beta', proposalShown: '_gamma_ delta' })
  })
  it('includes the normalised raw quote in the selected form', async () => {
    const { f } = await ready(); f.select(0, 5)
    expect(f.head().form).toMatchObject({ quote: 'alpha', focus: false })
    const g = fakes()
    g.api.draft.mockResolvedValue({ main: 'draft.typ', files: [{ file: 'draft.typ', text: '*alpha* \n beta', etag: 'v1' }] })
    const t = new ReviewSession(g.ports); await t.start(); await t.setName('Ada'); g.select(0, 14)
    expect(g.head().form).toMatchObject({ quote: '*alpha* beta', focus: false })
  })
  it.each(['proposal', 'comment'])('opens the form for a %s card and adds a comment to that item', async kind => {
    const { f, s } = await ready()
    if (kind === 'proposal') f.editor.replace(change)
    else s.commentOn({ from: 6, to: 10 }, 'First')
    const id = f.panel.upsertCard.mock.lastCall![0].id
    s.openForm({ id })
    expect(f.head().form).toEqual({ target: { id }, quote: 'beta', focus: true })
    s.commentOn(f.head().form!.target, 'Another')
    expect(f.panel.upsertCard.mock.lastCall![0]).toMatchObject({ id, comments: expect.arrayContaining([expect.objectContaining({ text: 'Another' })]) })
  })
  it('cancels the comment form without adding an item', async () => {
    const { f, s } = await ready(); f.select(0, 5)
    expect(f.head().form).not.toBeNull()
    s.cancelForm()
    expect(f.head().form).toBeNull(); expect(f.panel.upsertCard).not.toHaveBeenCalled(); expect(f.api.save).not.toHaveBeenCalled()
  })
  it('keeps visible PDF marks when renaming the reviewer', async () => {
    const { f, s } = await ready(); await s.setView('both')
    s.commentOn({ from: 6, to: 10 }, 'Ada note'); await f.advance(400)
    expect(f.pdf.setMarks.mock.lastCall![0]).not.toHaveLength(0)
    f.pdf.setMarks.mockClear(); await s.setName('Bob'); await f.advance(400)
    expect(f.pdf.setMarks).not.toHaveBeenCalled()
  })
  it('shows the sent confirmation when reopening a sent review', async () => {
    const f = fakes(); rememberSaved(f)
    f.api.open.mockResolvedValue({ review: { name: 'Ada', draft: 'draft.txt', sent: true, items: [] }, revision: 1 })
    const s = new ReviewSession(f.ports); await s.start(); await s.setName('Ada')
    expect(f.head().status).toBe('Review sent. Thank you.'); expect(f.head().editable).toBe(false)
  })
  it('waits for a name and honours reviewable', async () => {
    const f = fakes(); const s = new ReviewSession(f.ports); await s.start(); expect(f.editor.setEditable).toHaveBeenLastCalledWith(false)
    await s.setName('Ada'); expect(f.editor.setEditable).toHaveBeenLastCalledWith(true)
    const g = fakes(); const t = new ReviewSession({ ...g.ports, reviewable: false }); await t.start(); await t.setName('Ada'); expect(g.editor.setEditable).toHaveBeenLastCalledWith(false)
  })
  it('passes server-shaped keys to open and save and replaces invalid remembered keys', async () => {
    const { f, s } = await ready('Éva Smith')
    expect(f.store.rememberedKey()).toMatch(/^[A-Za-z0-9]{16}$/); expect(f.api.open).not.toHaveBeenCalled()
    f.editor.replace(change); await f.advance(5000)
    expect(f.api.save.mock.lastCall![0]).toMatch(/^[A-Za-z0-9]{16}$/)
    f.store.remember('invalid-key')
    const t = new ReviewSession(f.ports); await t.start(); await t.setName('Other')
    expect(f.store.rememberedKey()).toMatch(/^[A-Za-z0-9]{16}$/); expect(f.api.open).not.toHaveBeenCalled()
  })
  it('keeps a valid remembered key for the link when the name changes', async () => {
    const f = fakes(); rememberSaved(f)
    const s = new ReviewSession(f.ports); await s.start(); await s.setName('Ada')
    expect(f.api.open).toHaveBeenLastCalledWith('KnownReview12345')
    await s.setName('Bob')
    expect(f.api.open).toHaveBeenCalledExactlyOnceWith('KnownReview12345'); expect(f.store.rememberedKey()).toBe('KnownReview12345')
  })
  it('retries a failed PDF load on the next request', async () => {
    const { f, s } = await ready()
    f.pdf.show.mockRejectedValueOnce(new Error('temporary'))
    await s.setView('pdf'); expect(f.head().status).toBe('Could not load the PDF.')
    await s.setView('pdf'); expect(f.pdf.show).toHaveBeenCalledTimes(2)
    expect(f.head().status).not.toBe('Could not load the PDF.')
  })
  it('disposes pending saves and PDF marks and unsubscribes all listeners', async () => {
    const { f, s } = await ready()
    await s.setView('both'); f.editor.replace(change)
    s.dispose(); const calls = f.panel.setHead.mock.calls.length
    await f.advance(1000)
    f.select(0, 5); f.pdfSelect('alpha'); f.editor.replace(change)
    expect(f.api.save).not.toHaveBeenCalled()
    expect(f.pdf.setMarks).not.toHaveBeenCalled()
    expect(f.panel.setHead).toHaveBeenCalledTimes(calls)
    expect(f.unsubscribed()).toBe(3)
  })
  it('renders typing, singular counts, and only changed cards', async () => {
    const { f } = await ready(); f.editor.replace(change)
    expect(f.editor.setMarks.mock.lastCall![0]).toEqual([expect.objectContaining({ from: 6, to: 14 })])
    expect(f.editor.setMarks.mock.lastCall![1]).toEqual([expect.objectContaining({ text: 'beta' })])
    expect(f.panel.setCount).toHaveBeenLastCalledWith({ changes: 1, comments: 0 })
    f.editor.replace({ from: 21, to: 26, insert: 'last' }); f.panel.upsertCard.mockClear(); f.panel.setOrder.mockClear()
    f.editor.replace({ from: 6, to: 14, insert: 'bright' })
    expect(f.panel.upsertCard).toHaveBeenCalledTimes(1); expect(f.panel.setOrder).not.toHaveBeenCalled()
    expect(f.editor.text).not.toHaveBeenCalled()
  })
  it('maps selections to proposals and plain targets without focusing', async () => {
    const { f } = await ready(); f.editor.replace(change); f.select(7, 12)
    expect(f.head().form).toMatchObject({ target: { id: expect.any(String) }, focus: false })
    f.select(0, 5); expect(f.head().form).toEqual({ target: { from: 0, to: 5 }, quote: 'alpha', focus: false })
  })
  it('places PDF selections, focuses, scrolls, and reports misses', async () => {
    const { f } = await ready(); f.pdfSelect('beta')
    expect(f.head().form).toEqual({ target: { from: 6, to: 10 }, quote: 'beta', focus: true }); expect(f.editor.scrollTo).toHaveBeenLastCalledWith(6)
    f.pdfSelect('absent'); expect(f.head().status).toBe('That selection could not be placed in the draft. Select a little more, or use the editor.')
  })
  it('adds multiple comments, removes the last note, and orders cards', async () => {
    const { f, s } = await ready(); s.commentOn({ from: 11, to: 16 }, 'one'); const id = f.panel.upsertCard.mock.lastCall![0].id
    s.commentOn({ id }, 'two'); expect(f.panel.upsertCard.mock.lastCall![0].comments).toHaveLength(2)
    s.commentOn({ from: 0, to: 5 }, 'first'); expect(f.panel.setOrder.mock.lastCall![0][1]).toBe(id)
    s.deleteComment(id, 0); s.deleteComment(id, 0); expect(f.panel.removeCard).toHaveBeenCalledWith(id)
    expect(f.panel.setCount).toHaveBeenLastCalledWith({ changes: 0, comments: 1 })
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
  it('restores the stored PDF look at start, defaulting to changes', async () => {
    const f = fakes(); await new ReviewSession(f.ports).start(); expect(f.pdf.setLook).toHaveBeenLastCalledWith('changes'); expect(f.head().pdfLook).toBe('changes')
    const g = fakes(); g.store.setPdfLook('new'); await new ReviewSession(g.ports).start(); expect(g.pdf.setLook).toHaveBeenLastCalledWith('new'); expect(g.head().pdfLook).toBe('new')
  })
  it('stores the look and calls setLook without placing again', async () => {
    const { f, s } = await ready(); await s.setView('both'); await f.advance(400); f.pdf.setMarks.mockClear()
    await s.setPdfLook('new'); await f.advance(1000)
    expect(f.store.setPdfLook).toHaveBeenLastCalledWith('new'); expect(f.pdf.setLook).toHaveBeenLastCalledWith('new'); expect(f.pdf.setMarks).not.toHaveBeenCalled(); expect(f.head().pdfLook).toBe('new')
  })
  it('restores the remembered view', async () => { const f = fakes(); f.store.setView('pdf'); const s = new ReviewSession(f.ports); await s.start(); expect(f.pdf.show).toHaveBeenCalledTimes(1) })
  it('saves after 5 s and reconciles drift before serialising', async () => {
    const { f } = await ready(); f.editor.replace(change); await f.advance(4999); expect(f.api.save).not.toHaveBeenCalled()
    f.drift('alpha blue gamma delta'); await f.advance(1); const record = JSON.parse(f.api.save.mock.lastCall![1]); expect(record.items[0].proposal).toBe('blue'); expect(f.editor.text).toHaveBeenCalledTimes(1)
    expect(f.head().status).toBe('Saved')
    expect(f.diagnostic).toHaveBeenCalledWith('The editor and review differed; the review was rebuilt.')
  })
  it('sends immediately, stops edits, and restores editing on refusal', async () => {
    const { f, s } = await ready(); f.editor.replace(change); await s.send(); expect(f.api.save).toHaveBeenCalledTimes(1); expect(JSON.parse(f.api.save.mock.lastCall![1]).sent).toBe(true)
    expect(f.editor.setEditable).toHaveBeenLastCalledWith(false); expect(f.head().status).toBe('Review sent. Thank you.')
    const { f: g, s: t } = await ready(); g.editor.replace(change); g.api.save.mockResolvedValue({ status: 413, error: 'tooLarge' }); await t.send(); expect(g.editor.setEditable).toHaveBeenLastCalledWith(true); expect(g.head().status).toBe('Your review is over 1 MB and cannot be saved; shorten some comments.')
    await g.advance(1000); expect(g.api.save).toHaveBeenCalledTimes(1)
  })
  it('opens, places saved items, and reports lost quotes', async () => {
    const f = fakes(); rememberSaved(f); f.api.open.mockResolvedValue({ review: { name: 'Ada', draft: 'draft.txt', sent: true, items: [
      { kind: 'proposal', from: 0, quote: { exact: 'beta', prefix: '', suffix: '' }, proposal: 'blue', comments: [], at: f.clock.now() },
      { kind: 'comment', from: 0, quote: { exact: 'missing', prefix: '', suffix: '' }, comments: [{ text: 'lost', at: f.clock.now() }], at: f.clock.now() },
    ] }, revision: 0 }); const s = new ReviewSession(f.ports); await s.start(); await s.setName('Ada')
    expect(f.editor.setText).toHaveBeenLastCalledWith('alpha blue gamma delta'); expect(f.head().status).toBe('Review sent. Thank you.'); expect(f.editor.setEditable).toHaveBeenLastCalledWith(false)
  })
  it('can save again after a non-retried refusal', async () => {
    const { f } = await ready(); f.api.save.mockResolvedValueOnce({ status: 400, error: 'badReview' }); f.editor.replace(change); await f.advance(5000)
    f.editor.replace({ from: 6, to: 14, insert: 'blue' }); await f.advance(5000); expect(f.api.save).toHaveBeenCalledTimes(2); expect(f.head().status).toBe('Saved')
  })
  it('hides the PDF switch and ignores PDF modes without a PDF', async () => {
    const f = fakes(); const s = new ReviewSession({ ...f.ports, hasPdf: false }); f.store.setView('both'); await s.start(); await s.setView('pdf')
    expect(f.head()).toMatchObject({ hasPdf: false, view: 'editor' }); expect(f.pdf.show).not.toHaveBeenCalled()
  })
  it('sorts loaded cards in draft order rather than saved order', async () => {
    const f = fakes(); rememberSaved(f); f.api.open.mockResolvedValue({ review: { name: 'Ada', draft: 'draft.txt', sent: false, items: [
      { kind: 'comment', from: 11, quote: { exact: 'gamma', prefix: '', suffix: '' }, comments: [{ text: 'later', at: f.clock.now() }], at: f.clock.now() },
      { kind: 'comment', from: 0, quote: { exact: 'alpha', prefix: '', suffix: '' }, comments: [{ text: 'first', at: f.clock.now() }], at: f.clock.now() },
    ] }, revision: 0 }); const s = new ReviewSession(f.ports); await s.start(); await s.setName('Ada')
    const ordered = f.panel.setOrder.mock.lastCall![0]; const cards = f.panel.upsertCard.mock.calls.map(c => c[0]); expect(ordered.map(id => cards.find(c => c.id === id)!.from)).toEqual([0, 11])
  })
  it('keeps Send read-only while a previous save finishes', async () => {
    const { f, s } = await ready(); let resolve!: (v: { revision: number }) => void
    f.api.save.mockImplementationOnce(() => new Promise(r => { resolve = r })); f.editor.replace(change); await f.advance(5000)
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


describe('S11b session regressions', () => {
  it('saves a comment at the second selection when both selections have the same quote', async () => {
    const f = fakes()
    f.api.draft.mockResolvedValue({ main: 'draft.txt', files: [{ file: 'draft.txt', text: 'alpha beta alpha', etag: 'v1' }] })
    const s = new ReviewSession(f.ports); await s.start(); await s.setName('Ada')
    f.select(0, 5)
    f.select(11, 16)
    s.commentOn(f.head().form!.target, 'Check the second alpha')
    await f.advance(5000)
    expect(JSON.parse(f.api.save.mock.lastCall![1]).items).toEqual([
      expect.objectContaining({ kind: 'comment', from: 11, quote: expect.objectContaining({ exact: 'alpha' }), comments: [expect.objectContaining({ text: 'Check the second alpha' })] }),
    ])
  })
  it('reuses the remembered key after a failed first open', async () => {
    const f = fakes(); rememberSaved(f); f.store.remember.mockClear()
    f.api.open.mockResolvedValueOnce({ status: 0, error: 'network' })
    const s = new ReviewSession(f.ports); await s.start()
    expect(f.store.remember).not.toHaveBeenCalled()
    await s.setName('Ada L')
    expect(f.api.open.mock.calls.map(call => call[0])).toEqual(['KnownReview12345', 'KnownReview12345'])
    expect(f.store.rememberedKey()).toBe('KnownReview12345')
  })
  it('does not consume the remembered key for a superseded first open', async () => {
    const f = fakes(); rememberSaved(f); f.store.remember.mockClear()
    let resolve!: (value: { review: null }) => void
    f.api.open.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const s = new ReviewSession(f.ports); const first = s.start()
    for (let i = 0; i < 8; i++) await Promise.resolve()
    expect(f.store.remember).not.toHaveBeenCalled()
    await s.setName('Ada L'); resolve({ review: null }); await first
    expect(f.api.open.mock.calls.map(call => call[0])).toEqual(['KnownReview12345', 'KnownReview12345'])
    expect(f.store.remember).toHaveBeenCalledTimes(1)
    expect(f.head().name).toBe('Ada L')
  })
  it('keeps the editor and key when the current name is re-entered with whitespace', async () => {
    const { f, s } = await ready(); const key = vi.spyOn(f.ids, 'key')
    f.editor.replace(change); await f.advance(5000)
    await s.setName('  Ada  ')
    expect(f.editor.text()).toBe('alpha brighter gamma delta')
    expect(f.api.open).not.toHaveBeenCalled(); expect(key).not.toHaveBeenCalled()
  })
  it('keeps the attempted name while opening and after open fails', async () => {
    const f = fakes(); rememberSaved(f); f.api.open.mockResolvedValueOnce({ status: 0, error: 'network' })
    const s = new ReviewSession(f.ports); await s.start()
    let resolve!: (value: { status: number; error: string }) => void
    f.api.open.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const opening = s.setName('Bob')
    expect(f.head().name).toBe('Bob')
    resolve({ status: 0, error: 'network' }); await opening
    expect(f.head()).toMatchObject({ name: 'Bob', editable: false, status: 'Could not load your review: network' })
  })
  it('falls back to the editor and remembers it after PDF load failure', async () => {
    const f = fakes(); f.store.setView('pdf'); f.pdf.show.mockRejectedValueOnce(new Error('offline'))
    const s = new ReviewSession(f.ports); await s.start()
    expect(f.store.view()).toBe('editor'); expect(f.head().view).toBe('editor')
    await s.setView('pdf'); expect(f.store.view()).toBe('pdf'); expect(f.head().status).toBe('Enter your name to start.')
  })
})
