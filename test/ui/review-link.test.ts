import { afterEach, expect, it, vi } from 'vitest'
import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { createPanelModel } from '../../src/ui/panel-model'
import { ReviewLink } from '../../src/ui/review-link'

let el: HTMLDivElement
afterEach(() => { act(() => render(null, el)); document.body.replaceChildren() })
it('shows the saved link, Copy command, and accessible feedback', () => {
  el = document.createElement('div'); document.body.append(el)
  const model = createPanelModel(), session = { copyReviewLink: vi.fn() }
  act(() => render(h(ReviewLink, { model, session }), el))
  expect(el.querySelector('input')).toBeNull()
  const url = 'https://example.invalid/r/synthetic#Abcdef1234567890'
  act(() => model.setLink({ url, message: '' }))
  const input = el.querySelector('input')!
  expect(input.value).toBe(url); expect(input.readOnly).toBe(true)
  expect(el.querySelector('label')?.textContent).toBe('Your review link')
  expect(el.textContent).toContain('Open it on any device to continue your review.')
  act(() => el.querySelector('button')!.click()); expect(session.copyReviewLink).toHaveBeenCalledOnce()
  for (const message of ['Link copied.', 'Copy failed; select the link and copy it.']) {
    act(() => model.setLink({ url, message }))
    expect(el.querySelector('[role="status"]')?.textContent).toBe(message)
    expect(el.querySelector('input')).toBe(input)
  }
  act(() => model.setLink(null)); expect(el.querySelector('input')).toBeNull()
})
