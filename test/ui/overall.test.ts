import { afterEach, expect, it, vi } from 'vitest'
import { act } from 'preact/test-utils'
import { createPanelModel } from '../../src/ui/panel-model'
import { mountPanel } from '../../src/ui/mount'
import type { PanelCommands } from '../../src/ui/panel-model'

let dispose: (() => void) | undefined
afterEach(() => { act(() => dispose?.()); dispose = undefined; document.body.replaceChildren() })
function setup(editable = true, reviewable = true) {
  const model = createPanelModel()
  model.setHead({ ...model.head.value, editable, reviewable })
  model.setOverallView?.('Saved synthetic note')
  const session = { setName: vi.fn(), setView: vi.fn(), openForm: vi.fn(), cancelForm: vi.fn(), commentOn: vi.fn(), deleteComment: vi.fn(), undoProposal: vi.fn(), focusItem: vi.fn(), send: vi.fn(), setOverall: vi.fn(), showKeptChanges: vi.fn() } satisfies PanelCommands
  const el = document.createElement('div'); document.body.append(el)
  dispose = mountPanel(el, model, session)
  act(() => {})
  return { model, session, el }
}
it('shows an accessible Overall comment box first, with restored text and an unchanged count', () => {
  const { el } = setup()
  const box = el.querySelector<HTMLTextAreaElement>('#gr-overall')
  expect(box).not.toBeNull()
  expect(el.querySelector('label[for="gr-overall"]')?.textContent).toBe('Overall comment')
  expect(box!.value).toBe('Saved synthetic note')
  expect(box!.readOnly).toBe(false)
  expect(el.querySelector('textarea')).toBe(box)
  expect(el.querySelector('#gr-count')?.textContent).toBe('0 changes, 0 comments')
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
  const { el } = setup(editable, reviewable)
  const box = el.querySelector<HTMLTextAreaElement>('#gr-overall')
  expect(box).not.toBeNull()
  expect(box!.readOnly).toBe(true)
  expect(box!.value).toBe('Saved synthetic note')
})
