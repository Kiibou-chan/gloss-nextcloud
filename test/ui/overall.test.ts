import { afterEach, expect, it, vi } from 'vitest'
import { act } from 'preact/test-utils'
import { ReviewSession } from '../../src/app/session'
import { fakes } from '../app/fakes'
import { createPanelModel } from '../../src/ui/panel-model'
import { mountFinish, mountPanel } from '../../src/ui/mount'
import type { PanelCommands } from '../../src/ui/panel-model'

let dispose: (() => void) | undefined
afterEach(() => { act(() => dispose?.()); dispose = undefined; document.body.replaceChildren() })
function setup(editable = true, reviewable = true) {
  const model = createPanelModel()
  model.setHead({ ...model.head.value, editable, reviewable })
  model.setOverallView?.('Saved synthetic note')
  const session = { setName: vi.fn(), setView: vi.fn(), setPdfLook: vi.fn(), openForm: vi.fn(), cancelForm: vi.fn(), commentOn: vi.fn(), deleteComment: vi.fn(), undoProposal: vi.fn(), focusItem: vi.fn(), send: vi.fn(), setOverall: vi.fn(), showKeptChanges: vi.fn(), copyReviewLink: vi.fn() } satisfies PanelCommands
  const el = document.createElement('div'); document.body.append(el)
  const fin = document.createElement('div'); document.body.append(fin)
  const unmountPanel = mountPanel(el, model, session), unmountFinish = mountFinish(fin, model, session)
  dispose = () => { unmountPanel(); unmountFinish() }
  if (editable) act(() => model.setStep('comment'))
  return { model, session, el: fin, panelEl: el }
}
it('shows an accessible Overall comment box first, with restored text and an unchanged count', () => {
  const { el } = setup()
  const box = el.querySelector<HTMLTextAreaElement>('#gr-overall')
  expect(box).not.toBeNull()
  expect(box!.getAttribute('aria-label')).toBe('Overall comment')
  expect(box!.value).toBe('Saved synthetic note')
  expect(box!.readOnly).toBe(false)
  expect(el.querySelector('textarea')).toBe(box)
  expect(el.querySelector('.gr-count')?.textContent).toBe('0 changes, 0 comments')
})
it('reports every input, keeps focus, and draws port updates synchronously', () => {
  const { el, model, session } = setup()
  const box = el.querySelector<HTMLTextAreaElement>('#gr-overall')!
  expect(box).not.toBeNull()
  box.focus()
  act(() => { box.value = '  Synthetic text\nMore text'; box.dispatchEvent(new Event('input', { bubbles: true })) })
  expect(session.setOverall).toHaveBeenLastCalledWith('  Synthetic text\nMore text')
  model.setOverallView?.('Updated synthetic text')
  expect(box.value).toBe('Updated synthetic text')
  expect(document.activeElement).toBe(box)
  act(() => { box.value = ''; box.dispatchEvent(new Event('input', { bubbles: true })) })
  expect(session.setOverall).toHaveBeenLastCalledWith('')
})
it.each([{ editable: false, reviewable: true }, { editable: false, reviewable: false }])('is read-only when editing is unavailable: %o', ({ editable, reviewable }) => {
  const { panelEl } = setup(editable, reviewable), el = panelEl
  const box = el.querySelector<HTMLTextAreaElement>('#gr-overall')
  expect(box).toBeNull()
  expect(panelEl.querySelector('.gr-overall-text')?.textContent).toBe('Overall commentSaved synthetic note')
})

it('keeps a typed space in the controlled box while disabling Send and omitting the saved item', async () => {
  const f = fakes(), model = createPanelModel()
  const session = new ReviewSession({ ...f.ports, panel: model })
  await session.start(); await session.setName('Ada')
  const el = document.createElement('div'); document.body.append(el)
  const unmount = mountFinish(el, model, session)
  dispose = () => { unmount(); session.dispose() }
  act(() => model.setStep('comment'))
  const box = el.querySelector<HTMLTextAreaElement>('#gr-overall')!
  act(() => { box.value = 'x'; box.dispatchEvent(new Event('input', { bubbles: true })) })
  expect(model.head.value.canSend).toBe(true)
  act(() => { box.value = ' '; box.dispatchEvent(new Event('input', { bubbles: true })) })
  expect(box.value).toBe(' ')
  expect(model.overall.value).toBe(' ')
  expect(model.head.value.canSend).toBe(false)
  await act(async () => { await session.send(); await f.advance(5000) })
  expect(box.value).toBe(' ')
  const saved = JSON.parse(f.api.save.mock.lastCall![1])
  expect(saved.items).toEqual([])
  expect(saved.sent).toBe(false)
})
