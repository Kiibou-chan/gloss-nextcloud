import { afterEach, expect, it, vi } from 'vitest'
import { act } from 'preact/test-utils'
import { createPanelModel } from '../../src/ui/panel-model'
import { mountFinish } from '../../src/ui/mount'
import type { PanelCommands } from '../../src/ui/panel-model'
import type { HeadView } from '../../src/app/view'

let dispose: (() => void) | undefined
afterEach(() => { act(() => dispose?.()); dispose = undefined; document.body.replaceChildren() })
const head = (extra: Partial<HeadView> = {}): HeadView => ({ name: 'Ada', title: 'synthetic.typ', hasPdf: true, view: 'editor', pdfLook: 'changes', editable: true, canSend: true, status: '', form: null, ...extra })
function setup(overall = 'Saved synthetic note') {
  const model = createPanelModel(), send = vi.fn()
  model.setHead(head()); model.setOverallView(overall)
  const el = document.createElement('div'); document.body.append(el)
  dispose = mountFinish(el, model, { send, setOverall: vi.fn() } as unknown as PanelCommands)
  return { model, send, el }
}
const click = (el: Element | null) => { expect(el).not.toBeNull(); act(() => (el as HTMLElement).click()) }

it('renders nothing during the review step', () => {
  const { el } = setup()
  expect(el.textContent).toBe('')
})
it('walks comment, summary, and back without losing the comment', () => {
  const { model, el } = setup()
  act(() => model.setStep('comment'))
  expect(el.querySelector('h2')?.textContent).toBe('Finish your review')
  expect(el.querySelector<HTMLTextAreaElement>('#gr-overall')?.value).toBe('Saved synthetic note')
  click(el.querySelector('#gr-fin-continue')); expect(model.step.value).toBe('summary')
  expect(el.querySelector('h2')?.textContent).toBe('Send your review')
  click(el.querySelector('#gr-fin-summary-back')); expect(model.step.value).toBe('comment')
  expect(el.querySelector<HTMLTextAreaElement>('#gr-overall')?.value).toBe('Saved synthetic note')
  click(el.querySelector('#gr-fin-back')); expect(model.step.value).toBe('review')
})
it('shows the draft and the overall comment as text on the summary, and sends from there', () => {
  const { model, send, el } = setup()
  act(() => model.setStep('summary'))
  expect(el.querySelector('.gr-fin-meta')?.textContent).toBe('Draft synthetic.typ')
  expect(el.querySelector('.gr-fin-text')?.textContent).toBe('Saved synthetic note')
  expect(el.querySelector('textarea')).toBeNull()
  click(el.querySelector('#gr-send')); expect(send).toHaveBeenCalledOnce()
})
it('says so when there is no overall comment', () => {
  const { model, el } = setup('  ')
  act(() => model.setStep('summary'))
  expect(el.querySelector('.gr-fin-none')?.textContent).toBe('No overall comment')
})
it('returns to the review step once the review is sent', () => {
  const { model } = setup()
  act(() => model.setStep('summary'))
  act(() => model.setHead(head({ sent: true })))
  expect(model.step.value).toBe('review')
})
