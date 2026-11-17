import { afterEach, expect, it } from 'vitest'
import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { ReviewSession } from '../../src/app/session'
import { createPanelModel } from '../../src/ui/panel-model'
import { Head } from '../../src/ui/head'
import { Panel } from '../../src/ui/panel'
import { Finish } from '../../src/ui/finish'
import { fakes } from '../app/fakes'
import { readFileSync } from 'node:fs'

let clean = () => {}
afterEach(() => { act(clean); document.body.replaceChildren() })
async function setup(named = true, comment = false) {
  const f = fakes(), model = createPanelModel(), session = new ReviewSession({ ...f.ports, panel: model })
  await session.start(); if (named) await session.setName('Ada')
  const root = document.createElement('div'); document.body.append(root)
  act(() => render(h('div', {}, h(Head, { model, session }), h(Panel, { model, session }), h(Finish, { model, session })), root))
  if (comment) act(() => model.setStep('comment'))
  clean = () => { render(null, root); session.dispose() }
  return { f, model, session, root }
}
it('keeps half-typed text and target through editor and PDF selections, and Cancel clears it', async () => {
  const { f, model, session, root } = await setup()
  act(() => f.select(0, 5))
  const box = root.querySelector<HTMLTextAreaElement>('#gr-comment')!
  act(() => { box.value = 'half typed thought'; box.dispatchEvent(new Event('input', { bubbles: true })) })
  expect(model.commentDraft.value).toBe('half typed thought')
  act(() => { f.select(6, 10); f.pdfSelect('gamma') })
  expect(box.value).toBe('half typed thought'); expect(model.head.value.form?.quote).toBe('alpha')
  act(() => session.cancelForm())
  expect(model.commentDraft.value).toBe('')
  act(() => f.pdfSelect('gamma'))
  expect(box.value).toBe(''); expect(model.head.value.form?.quote).toBe('gamma')
})
it('offers Comment on selection and documents Ctrl+Alt+M, with a bounded quote', async () => {
  const { root, model } = await setup()
  expect(root.querySelector('#gr-hint')?.textContent).toBe('Comment on selection'); expect(root.querySelector('#gr-hint button')?.getAttribute('title')).toContain('Ctrl+Alt+M')
  expect([...root.querySelectorAll('button')].some(b => b.textContent === 'Comment on selection')).toBe(true)
  act(() => model.setHead({ ...model.head.value, form: { target: { from: 0, to: 5 }, quote: 'x'.repeat(2000), focus: false } }))
  expect(root.querySelector('#gr-quote')!.textContent!.length).toBeLessThanOrEqual(201)
  expect(root.querySelector('#gr-quote')!.textContent).toMatch(/…$/)
})
it('clears the draft after Add', async () => {
  const { f, model, root } = await setup(); act(() => f.select(0, 5))
  const box = root.querySelector<HTMLTextAreaElement>('#gr-comment')!
  act(() => { box.value = 'Synthetic note'; box.dispatchEvent(new Event('input', { bubbles: true })); root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
  expect(model.commentDraft.value).toBe(''); expect(model.head.value.form).toBeNull()
})
it('focuses the name for an overall key before a name is supplied', async () => {
  const { root, model } = await setup(false, true)
  const event = new KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true })
  act(() => { root.querySelector('#gr-overall')!.dispatchEvent(event) })
  expect(event.defaultPrevented).toBe(true)
  expect(root.querySelector<HTMLInputElement>('#gr-name')!.value).toBe('')
  expect(model.head.value.status).toBe('Enter your name first.')
  expect(document.activeElement?.id).toBe('gr-name')
})
it('hides permanent read-only hints and empty overall, renders saved overall as text, and disables a sent name', async () => {
  const { root, model } = await setup()
  act(() => model.setHead({ ...model.head.value, reviewable: false, editable: false }))
  expect(root.querySelector<HTMLElement>('#gr-hint')!.hidden).toBe(true)
  expect(root.querySelector('#gr-overall')).toBeNull()
  act(() => { model.setOverallView('Synthetic sent note'); model.setHead({ ...model.head.value, reviewable: true, sent: true }) })
  expect(root.querySelector<HTMLTextAreaElement>('textarea#gr-overall')).toBeNull()
  expect(root.textContent).toContain('Synthetic sent note')
  expect(root.querySelector<HTMLButtonElement>('.gr-name-quiet')!.disabled).toBe(true)
})
it('disables the name field after Send', async () => {
  const { root, model } = await setup()
  act(() => model.setHead({ ...model.head.value, sent: true, editable: false }))
  expect(root.querySelector<HTMLButtonElement>('.gr-name-quiet')!.disabled).toBe(true)
})
it('shows a saved overall comment as plain text when read-only', async () => {
  const { root, model } = await setup()
  act(() => { model.setOverallView('Synthetic sent note'); model.setHead({ ...model.head.value, sent: true, editable: false }) })
  expect(root.querySelector('textarea#gr-overall')).toBeNull()
  expect(root.textContent).toContain('Synthetic sent note')
})
it('uses a small Delete button like Add comment', async () => {
  const { session, root } = await setup()
  act(() => session.commentOn({ from: 0, to: 5 }, 'Synthetic note'))
  const button = [...root.querySelectorAll('button')].find(b => b.textContent === 'Delete')!
  expect(button.classList.contains('gr-link')).toBe(false)
  expect(button.classList.contains('gr-small')).toBe(true)
})
it.each([
  ['single-column comment step up to 1000 px', /@media \(max-width:\s*1000px\)\s*\{ #gloss-review\[data-step="comment"\] \{ grid-template-columns: minmax\(0, 1fr\); \} #gloss-review\[data-step="comment"\] \.gr-body \{ display: none;/],
  ['quiet PDF line shares the status row', /\.gr-pdf-note-line\s*\{[^}]*order:\s*98/],
  ['reserved status row', /\.gr-status\s*\{[^}]*min-height:\s*1\.75em/],
  ['panel-width review link', /\.gr-review-link input[^}]*width:\s*100%/],
  ['panel-width kept changes', /\.gr-conflict textarea[^}]*width:\s*100%/],
  ['monospace content', /\.gr-text \.cm-content\s*\{[^}]*font-family:\s*ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace/],
  ['bounded quote', /\.gr-quote\s*\{[^}]*max-height:/],
  ['PDF page border', /\.gr-page\s*\{[^}]*border:\s*1px solid var\(--color-border\)/],
  ['PDF pane background', /\.gr-pdf\s*\{[^}]*background:\s*var\(--gr-panel\)/],
  ['PDF contained box', /\.gr-pdf\s*\{[^}]*box-sizing:\s*border-box/],
])('styles the %s', (_name, pattern) => {
  expect(readFileSync('css/review.css', 'utf8')).toMatch(pattern)
})

it('keeps an unfinished comment visible when Send is attempted', async () => {
  const { f, model, session, root } = await setup()
  act(() => { session.setOverall('Synthetic overall note'); f.select(0, 5) })
  const box = root.querySelector<HTMLTextAreaElement>('#gr-comment')!
  act(() => { box.value = 'Unfinished thought'; box.dispatchEvent(new Event('input', { bubbles: true })) })
  await act(async () => { await session.send() })
  expect(model.head.value.status).toBe('Add or cancel your comment before sending the review.')
  expect(root.querySelector<HTMLElement>('#gr-form')!.hidden).toBe(false)
  expect(box.value).toBe('Unfinished thought')
  expect(model.head.value.sent).toBe(false)
})
it.each(['Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Escape', 'Shift', 'Control', 'Alt', 'Meta'])('does not request a name for Overall navigation key %s', async key => {
  const { root, model } = await setup(false, true)
  const box = root.querySelector<HTMLTextAreaElement>('#gr-overall')!
  box.focus()
  act(() => { box.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })) })
  expect(model.head.value.status).toBe('Enter your name to start.')
  expect(document.activeElement).toBe(box)
})
it('requests a name for an Overall paste before a name is supplied', async () => {
  const { root, model } = await setup(false, true)
  act(() => { root.querySelector('#gr-overall')!.dispatchEvent(new Event('paste', { bubbles: true })) })
  expect(model.head.value.status).toBe('Enter your name first.')
})
it.each(['x', 'Enter', 'Backspace', 'Delete'])('requests a name for Overall text key %s', async key => {
  const { root, model } = await setup(false, true)
  act(() => { root.querySelector('#gr-overall')!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })) })
  expect(model.head.value.status).toBe('Enter your name first.')
})
it('does not request a name for Overall Shift+Tab', async () => {
  const { root, model } = await setup(false, true)
  act(() => { root.querySelector('#gr-overall')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true })) })
  expect(model.head.value.status).toBe('Enter your name to start.')
})
