import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fakes } from './app/fakes'

const state = vi.hoisted(() => ({ f: null as ReturnType<typeof fakes> | null, order: [] as string[] }))
vi.mock('../src/adapters/codemirror/editor', () => ({ createEditor: vi.fn(() => state.f!.editor) }))
vi.mock('../src/adapters/pdfjs/pdf-view', () => ({ createPdfView: vi.fn(() => state.f!.pdf) }))
vi.mock('../src/adapters/http/review-api', () => ({ createReviewApi: vi.fn(() => state.f!.api) }))
vi.mock('../src/adapters/storage/browser-store', () => ({ createBrowserStore: () => state.f!.store }))
vi.mock('../src/ui/panel-model', async importOriginal => {
  const original = await importOriginal<typeof import('../src/ui/panel-model')>()
  return { ...original, createPanelModel: () => { state.order.push('model'); return original.createPanelModel() } }
})
vi.mock('../src/ui/mount', async importOriginal => {
  const original = await importOriginal<typeof import('../src/ui/mount')>()
  return {
    mountHead: (...args: Parameters<typeof original.mountHead>) => { state.order.push('head'); expect(state.f!.editor.onEdit).toBeDefined(); return original.mountHead(...args) },
    mountPanel: (...args: Parameters<typeof original.mountPanel>) => { state.order.push('panel'); return original.mountPanel(...args) },
  }
})
import { mountReview } from '../src/main'
import { createEditor } from '../src/adapters/codemirror/editor'
import { createPdfView } from '../src/adapters/pdfjs/pdf-view'

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); state.order = [] })
function root(hasPdf = true) {
  // Render exactly the PHP template's slots, replacing only its escaped scalar parameters.
  const template = readFileSync('templates/review.php', 'utf8').replace(/<\?php[\s\S]*?\?>/g, '')
  document.body.innerHTML = template
  const el = document.querySelector<HTMLElement>('#gloss-review')!
  Object.assign(el.dataset, { token: 'synthetic', hasPdf: hasPdf ? '1' : '', reviewable: '1', worker: '/js/pdf.worker.js' })
  return el
}
it('wires the template, session, islands, view layout, and teardown', async () => {
  state.f = fakes(); const el = root()
  const dispose = await mountReview(el)
  expect(state.order).toEqual(['model', 'head', 'panel'])
  expect(createEditor).toHaveBeenLastCalledWith(el.querySelector('#gr-text'), { text: 'alpha beta gamma delta', language: 'plain', spellLanguage: 'en' })
  expect(createPdfView).toHaveBeenLastCalledWith(el.querySelector('#gr-pdf'), expect.objectContaining({ workerUrl: '/js/pdf.worker.js' }))
  expect(state.f.api.draft).toHaveBeenCalledTimes(1)
  const name = el.querySelector<HTMLInputElement>('#gr-name')!
  name.value = 'Ada'; name.dispatchEvent(new Event('input', { bubbles: true })); name.dispatchEvent(new Event('change', { bubbles: true }))
  await vi.waitFor(() => expect(el.querySelector('#gr-send')).not.toBeNull())
  await vi.waitFor(() => expect(state.f!.editor.setEditable).toHaveBeenLastCalledWith(true))
  expect(state.f.api.open).not.toHaveBeenCalled()
  expect(state.f.store.rememberedKey()).toMatch(/^[A-Za-z0-9]{16}$/)
  state.f.editor.replace({ from: 6, to: 10, insert: 'blue' })
  expect(el.querySelector('#gr-count')?.textContent).toBe('1 change, 0 comments')
  el.querySelector<HTMLButtonElement>('#gr-view-both')!.click()
  await vi.waitFor(() => expect(el.dataset.view).toBe('both'))
  expect(el.querySelector<HTMLElement>('#gr-text')!.hidden).toBe(false)
  expect(el.querySelector<HTMLElement>('#gr-pdf')!.hidden).toBe(false)
  el.querySelector<HTMLButtonElement>('#gr-view-pdf')!.click()
  expect(el.querySelector<HTMLElement>('#gr-text')!.hidden).toBe(true)
  window.dispatchEvent(new Event('pagehide'))
  await state.f.advance(1000)
  expect(state.f.api.save).not.toHaveBeenCalled()
  expect(state.f.unsubscribed()).toBe(3)
  expect(el.querySelector('.gr-head')!.childNodes).toHaveLength(0)
  dispose()
})
it('uses the source language and hides PDF controls when absent', async () => {
  state.f = fakes(); state.f.api.draft.mockResolvedValue({ main: 'paper.typ', files: [{ file: 'paper.typ', text: '#set text(lang: "de")\nSynthetic', etag: '1' }] })
  const el = root(false); const dispose = await mountReview(el)
  expect(createEditor).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ language: 'typst', spellLanguage: 'de' }))
  expect(el.querySelector<HTMLElement>('.gr-views')!.hidden).toBe(true)
  dispose()
})

it('keeps the page usable after persisted pagehide and pageshow', async () => {
  state.f = fakes(); const el = root(); const dispose = await mountReview(el)
  try {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    const name = el.querySelector<HTMLInputElement>('#gr-name')
    expect(name).not.toBeNull()
    name!.value = 'Ada'; name!.dispatchEvent(new Event('change', { bubbles: true }))
    await vi.waitFor(() => expect(state.f!.editor.setEditable).toHaveBeenLastCalledWith(true))
    state.f.editor.replace({ from: 6, to: 10, insert: 'blue' })
    await vi.waitFor(() => expect(state.f!.api.save).toHaveBeenCalledTimes(1), { timeout: 1500 })
    expect(state.f.unsubscribed()).toBe(0)
  } finally { dispose() }
})
it('reports the page-load error through the diagnostic path', async () => {
  state.f = fakes(); const error = new Error('synthetic draft failure')
  state.f.api.draft.mockRejectedValueOnce(error)
  const report = vi.spyOn(console, 'error').mockImplementation(() => {})
  const el = root(); vi.resetModules(); await import('../src/main')
  await vi.waitFor(() => expect(report).toHaveBeenCalledWith('Could not load the draft.', error))
  expect(el.querySelector('.gr-head')?.textContent).toBe('Could not load the draft.')
})
