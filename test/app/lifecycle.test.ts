import { expect, test, vi } from 'vitest'
import { Lifecycle } from '../../src/app/lifecycle'
import { SessionState } from '../../src/app/session-state'
import { fakes } from './fakes'
import { shown } from '../../src/domain/source/shown'

test('loads a draft, restores its backup revision, and keeps conflicting changes', async () => {
  const f = fakes(), s = new SessionState(f.ports)
  const actions = { backup: vi.fn(), changed: vi.fn(), createQueue: vi.fn(), head: vi.fn(), install: vi.fn(), refusal: vi.fn(), render: vi.fn(), restoreLook: vi.fn(), setView: vi.fn() }
  const unit = new Lifecycle(s, actions)
  await unit.start()
  expect(s.file).toBe('draft.txt')
  expect(f.editor.text()).toBe('alpha beta gamma delta')
  const record = unit.emptyRecord('Ada')
  const backup = { review: JSON.stringify({ ...record, revision: 1, format: 1 }), revision: 7, pending: null, saved: true, dirty: true, at: f.clock.now() }
  unit.restore(backup)
  expect(actions.install).toHaveBeenLastCalledWith({ ...record, revision: 7 })
  s.key = 'Abcdef1234567890'
  unit.keepConflict(backup); unit.showKeptChanges()
  expect(f.store.keepConflict).toHaveBeenCalledExactlyOnceWith(s.key, backup)
  expect(f.panel.setConflictView).toHaveBeenLastCalledWith({ text: '', show: true })
})

test('uses the resolved main file and language without fetching the draft again', async () => {
  const f = fakes()
  const main = { file: 'resolved.typ', text: '#strong[alpha]', etag: 'v2', language: 'typst' as const }
  const s = new SessionState(f.ports, { address: '', fragment: '' }, main)
  const actions = { backup: vi.fn(), changed: vi.fn(), createQueue: vi.fn(), head: vi.fn(), install: vi.fn(), refusal: vi.fn(), render: vi.fn(), restoreLook: vi.fn(), setView: vi.fn() }
  await new Lifecycle(s, actions).start()
  expect(f.api.draft).not.toHaveBeenCalled()
  expect(f.editor.text()).toBe(main.text)
  expect(s.file).toBe(main.file)
  expect(shown(main.text, s.ops, 0, main.text.length)).toBe('alpha')
})

test('reads a LaTeX draft through latexOps, hiding markup from the key and from shown', async () => {
  const f = fakes()
  const text = '\\begin{document}\\textbf{alpha}\\vspace{1em} beta\\end{document}'
  const main = { file: 'main.tex', text, etag: 'v1', language: 'latex' as const }
  const s = new SessionState(f.ports, { address: '', fragment: '' }, main)
  const actions = { backup: vi.fn(), changed: vi.fn(), createQueue: vi.fn(), head: vi.fn(), install: vi.fn(), refusal: vi.fn(), render: vi.fn(), restoreLook: vi.fn(), setView: vi.fn() }
  await new Lifecycle(s, actions).start()
  expect(s.source?.key).toBe('alphabeta')
  expect(shown(text, s.ops, 0, text.length)).toBe('{alpha} beta')
})

test.each([403, 404, 410, 413])('applies explicit refusal editability at the open call site for %i', async status => {
  const f = fakes(), s = new SessionState(f.ports)
  const actions = { backup: vi.fn(), changed: vi.fn(), createQueue: vi.fn(), head: vi.fn(), install: vi.fn(), refusal: vi.fn(() => ({ text: 'Refused.', blocks: status !== 413 })), render: vi.fn(), restoreLook: vi.fn(), setView: vi.fn() }
  f.api.open.mockResolvedValue({ status, error: 'refused' })
  await new Lifecycle(s, actions).loadReview('', null)
  expect(s.status).toBe('Refused.'); expect(s.blocked).toBe(status !== 413)
  expect(f.ports.reviewable).toBe(status !== 403)
})
