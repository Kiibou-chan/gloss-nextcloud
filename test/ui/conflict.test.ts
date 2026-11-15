// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { render, h } from 'preact'
import { Conflict } from '../../src/ui/conflict'
import { ReviewSession } from '../../src/app/session'
import { createPanelModel } from '../../src/ui/panel-model'
import { mountHead } from '../../src/ui/mount'
import { fakes } from '../app/fakes'
it('opens kept changes as read-only text with quote, proposal, and comments', () => {
  const root = document.createElement('div'); let shown = false
  render(h(Conflict, { text: 'beta\nblue\nSynthetic comment', show: false, onShow: () => { shown = true } }), root)
  const button = root.querySelector('button')!; expect(button.textContent).toBe('Show the changes from this browser'); button.click(); expect(shown).toBe(true)
  render(h(Conflict, { text: 'beta\nblue\nSynthetic comment', show: true, onShow: () => {} }), root)
  const box = root.querySelector('textarea')!; expect(box.readOnly).toBe(true); expect(box.value).toContain('Synthetic comment'); expect(box.value).toContain('beta\nblue')
})
it.each(['open', 'save'] as const)('removes name and Send after 403 notReviewable from %s', async action => {
  const f = fakes(); const model = createPanelModel(); const s = new ReviewSession({ ...f.ports, panel: model }); const root = document.createElement('header'); const unmount = mountHead(root, model, s)
  if (action === 'open') { f.store.remember('Abcdef1234567890'); f.store.write('Abcdef1234567890', { review: '{}', revision: 0, pending: null, saved: true, dirty: false, at: f.clock.now() }); f.api.open.mockResolvedValue({ status: 403, error: 'notReviewable' }) }
  await s.start()
  if (action === 'save') { await s.setName('Ada'); expect(root.querySelector('#gr-name')).not.toBeNull(); f.api.save.mockResolvedValue({ status: 403, error: 'notReviewable' }); f.editor.replace({ from: 6, to: 10, insert: 'blue' }); await f.advance(5000) }
  expect(root.querySelector('#gr-name')).toBeNull(); expect(root.querySelector('#gr-send')).toBeNull(); unmount(); s.dispose()
})
