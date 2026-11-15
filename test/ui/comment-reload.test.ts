import { afterEach, expect, it } from 'vitest'
import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { ReviewSession } from '../../src/app/session'
import { createPanelModel } from '../../src/ui/panel-model'
import { Panel } from '../../src/ui/panel'
import { fakes } from '../app/fakes'

const cleanups: (() => void)[] = []
afterEach(() => { act(() => cleanups.splice(0).forEach(clean => clean())); document.body.replaceChildren() })
it('restores the open half-typed comment and selection after a saved editor edit and reload', async () => {
  const f = fakes()
  async function mount() {
    const model = createPanelModel(), session = new ReviewSession({ ...f.ports, panel: model })
    await session.start()
    const root = document.createElement('div'); document.body.append(root)
    act(() => render(h(Panel, { model, session }), root))
    cleanups.push(() => { render(null, root); session.dispose() })
    return { model, session, root }
  }
  const first = await mount(); await act(() => first.session.setName('Ada Example'))
  act(() => f.select(0, 5))
  const box = first.root.querySelector<HTMLTextAreaElement>('#gr-comment')!
  act(() => { box.value = 'half typed thought'; box.dispatchEvent(new Event('input', { bubbles: true })) })
  act(() => f.editor.replace({ from: 6, to: 10, insert: 'blue' }))
  await act(() => f.advance(5000))
  expect(first.model.head.value.status).toBe('Saved')
  f.api.open.mockResolvedValue({ review: JSON.parse(f.api.save.mock.lastCall![1]), revision: 1 })
  act(() => cleanups.pop()!())
  const second = await mount()
  expect(second.root.querySelector<HTMLTextAreaElement>('#gr-comment')!.value).toBe('half typed thought')
  expect(second.model.head.value.form).toMatchObject({ target: { from: 0, to: 5 }, quote: 'alpha' })
  expect(second.root.querySelector<HTMLElement>('#gr-form')!.hidden).toBe(false)
  expect(f.api.save.mock.calls.every(call => !call[1].includes('half typed thought'))).toBe(true)
})
