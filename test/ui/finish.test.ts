import { afterEach, expect, it, vi } from 'vitest'
import { act } from 'preact/test-utils'
import { createPanelModel } from '../../src/ui/panel-model'
import { mountFinish, mountHead } from '../../src/ui/mount'
import type { PanelCommands } from '../../src/ui/panel-model'
import type { HeadView } from '../../src/app/view'

let dispose: (() => void) | undefined
afterEach(() => { act(() => dispose?.()); dispose = undefined; document.body.replaceChildren() })
const head = (extra: Partial<HeadView> = {}): HeadView => ({ loading: false, name: 'Ada', title: 'synthetic.typ', hasPdf: true, view: 'editor', pdfLook: 'changes', editable: true, canSend: true, status: '', form: null, ...extra })
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
it.each(['continue', 'summary back', 'review back'])('moves focus after %s from a focused button', transition => {
  const { model, el } = setup()
  const header = document.createElement('header'); document.body.prepend(header)
  const disposeFinish = dispose!, disposeHead = mountHead(header, model, {} as PanelCommands)
  dispose = () => { disposeFinish(); disposeHead() }
  act(() => model.setStep('comment'))
  expect(document.activeElement).toBe(el.querySelector('h2'))
  if (transition === 'summary back') act(() => model.setStep('summary'))
  const selector = transition === 'continue' ? '#gr-fin-continue' : transition === 'summary back' ? '#gr-fin-summary-back' : '#gr-fin-back'
  const button = el.querySelector<HTMLButtonElement>(selector)!
  button.focus(); expect(document.activeElement).toBe(button)
  click(button)
  expect(document.activeElement).toBe(transition === 'review back' ? header.querySelector('#gr-finish') : el.querySelector('h2'))
})


it.each(['comment', 'summary'] as const)('disables sending from %s with an explanation inside the step', step => {
  const { model, el, send } = setup('')
  const selector = step === 'comment' ? '#gr-fin-continue' : '#gr-send'
  for (const status of ['', 'Saved', 'Saving…', 'Review link copied.']) {
    act(() => { model.setStep(step); model.setHead(head({ canSend: false, status })) })
    expect(el.querySelector<HTMLButtonElement>(selector)?.disabled).toBe(true)
    expect(el.querySelector('[role="status"]')?.textContent).toBe('Add a change or a comment before sending.')
    click(el.querySelector(selector))
    expect(model.step.value).toBe(step); expect(send).not.toHaveBeenCalled()
  }
  act(() => model.setHead(head({ canSend: false, editable: false, status: 'This review is read-only.' })))
  expect(el.querySelector('[role="status"]')?.textContent).toBe('This review is read-only.')
  act(() => model.setHead(head()))
  expect(el.querySelector<HTMLButtonElement>(selector)?.disabled).toBe(false)
  expect(el.querySelector('[role="status"]')?.textContent ?? '').toBe('')
})
