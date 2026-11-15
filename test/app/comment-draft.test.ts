import { expect, it, vi } from 'vitest'
import { ReviewSession } from '../../src/app/session'
import { fakes } from './fakes'

const key = 'Abcdef1234567890'
function stored(target = { from: 0, to: 5 }, file = 'draft.txt') {
  return JSON.stringify({ file, target, quote: { exact: 'alpha', prefix: '', suffix: ' beta gamma delta' }, text: 'half typed thought', at: '2026-11-15T20:00:00.000Z' })
}
async function reload(text = 'alpha beta gamma delta', raw = stored()) {
  const f = fakes()
  f.store.remember(key)
  f.draftStore.write(key, raw)
  f.api.draft.mockResolvedValue({ main: 'draft.txt', files: [{ file: 'draft.txt', text, etag: 'v2' }] })
  f.api.open.mockResolvedValue({ review: { name: 'Ada', draft: 'draft.txt', sent: false, items: [] }, revision: 1 })
  let textDraft = ''
  const setCommentDraft = vi.fn((text: string) => { textDraft = text })
  const session = new ReviewSession({ ...f.ports, panel: { ...f.panel, setCommentDraft, hasCommentDraft: () => !!textDraft, clearCommentDraft: () => { textDraft = '' } } }, { address: '', fragment: '#' + key })
  await session.start()
  return { f, session, setCommentDraft }
}
it('restores a persisted draft after placing the review and follows a moved passage', async () => {
  const { f, setCommentDraft } = await reload('New: alpha beta gamma delta')
  expect(setCommentDraft).toHaveBeenCalledWith('half typed thought')
  expect(f.head().form).toMatchObject({ target: { from: 5, to: 10 }, quote: 'alpha', focus: false })
})
it('keeps an unplaced draft open and asks for a new selection', async () => {
  const { f, setCommentDraft } = await reload('A completely different synthetic draft.')
  expect(setCommentDraft).toHaveBeenCalledWith('half typed thought')
  expect(f.head()).toMatchObject({ form: { detached: true }, status: 'Select the passage again to add this comment.' })
})
it('clears the persisted draft on Cancel', async () => {
  const { f, session } = await reload()
  session.cancelForm()
  expect(f.draftStore.read(key)).toBeNull()
})
it('clears a persisted draft on Add and excludes its private text from saved bodies until Add', async () => {
  const { f, session } = await reload()
  session.commentOn(f.head().form!.target, 'half typed thought')
  expect(f.draftStore.read(key)).toBeNull()
  await f.advance(5000)
  expect(JSON.parse(f.api.save.mock.lastCall![1]).items[0].comments[0].text).toBe('half typed thought')
})
it('keeps the text when a missing target is reselected, and permits Add only after selection', async () => {
  const { f, session } = await reload('A completely different synthetic draft.')
  session.commentOn(f.head().form!.target, 'half typed thought')
  expect(f.panel.upsertCard).not.toHaveBeenCalled()
  f.select(2, 12)
  expect(f.head().form).toMatchObject({ target: { from: 2, to: 12 }, quote: 'completely' })
  expect(f.head().status).not.toBe('Select the passage again to add this comment.')
  expect(JSON.parse(f.draftStore.read(key)!).text).toBe('half typed thought')
  session.commentOn(f.head().form!.target, 'half typed thought')
  expect(f.draftStore.read(key)).toBeNull()
})
it('clears an empty persisted form draft only after Send succeeds', async () => {
  const { f, session } = await reload()
  session.setCommentDraft('')
  session.setOverall('Synthetic overall comment')
  let finish!: (value: { revision: number }) => void
  f.api.save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const sending = session.send()
  expect(f.draftStore.read(key)).not.toBeNull()
  finish({ revision: 2 }); await sending
  expect(f.draftStore.read(key)).toBeNull()
})
it('uses the supplied clock, retains whitespace, and isolates drafts by review key', async () => {
  const { f, session } = await reload()
  session.setCommentDraft('  half typed thought\n')
  expect(JSON.parse(f.draftStore.read(key)!)).toMatchObject({ text: '  half typed thought\n', at: f.clock.now() })
  expect(f.draftStore.read('OtherReview12345')).toBeNull()
})
it('retains text and the old quote when a proposal target no longer exists', async () => {
  const raw = JSON.stringify({ ...JSON.parse(stored()), target: { id: 'missing-proposal' } })
  const { f, session, setCommentDraft } = await reload(undefined, raw)
  expect(f.head()).toMatchObject({ form: { detached: true, quote: 'alpha' }, status: 'Select the passage again to add this comment.' })
  session.setCommentDraft('A revised half-typed thought')
  expect(JSON.parse(f.draftStore.read(key)!)).toMatchObject({ target: { id: 'missing-proposal' }, text: 'A revised half-typed thought' })
  f.pdfSelect('beta')
  expect(f.head().form).toMatchObject({ target: { from: 6, to: 10 }, quote: 'beta' })
  expect(setCommentDraft).toHaveBeenLastCalledWith('A revised half-typed thought')
})
it('does not place a draft belonging to a different file', async () => {
  const { f, setCommentDraft } = await reload(undefined, stored(undefined, 'other.txt'))
  expect(setCommentDraft).toHaveBeenCalledWith('half typed thought')
  expect(f.head().form).toMatchObject({ detached: true })
})
it.each(['broken', '{}', 'null', JSON.stringify({ ...JSON.parse(stored()), target: { from: -1, to: 5 } })])('ignores invalid stored form data without opening a form: %s', async raw => {
  const { f, setCommentDraft } = await reload(undefined, raw)
  expect(f.head().form).toBeNull()
  expect(setCommentDraft).not.toHaveBeenCalled()
})
it('restores a PDF selection and a proposal target after their review has loaded', async () => {
  for (const proposal of [false, true]) {
    const f = fakes()
    const first = new ReviewSession(f.ports)
    await first.start(); await first.setName('Ada')
    if (proposal) {
      f.editor.replace({ from: 6, to: 10, insert: 'blue' })
      first.openForm({ id: f.panel.upsertCard.mock.lastCall![0].id })
    } else f.pdfSelect('beta')
    const target = f.head().form!.target
    first.setCommentDraft('Synthetic private draft')
    first.setOverall('Synthetic saved note'); await f.advance(5000)
    f.api.open.mockResolvedValue({ review: JSON.parse(f.api.save.mock.lastCall![1]), revision: 1 })
    first.dispose()
    const setCommentDraft = vi.fn()
    const second = new ReviewSession({ ...f.ports, panel: { ...f.panel, setCommentDraft } })
    await second.start()
    expect(setCommentDraft).toHaveBeenCalledWith('Synthetic private draft')
    expect(f.head().form).toMatchObject({ target, quote: 'beta' })
    expect(f.head().form?.detached).not.toBe(true)
    second.dispose()
  }
})
