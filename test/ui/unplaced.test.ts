import { expect, it } from 'vitest'
import { ReviewSession } from '../../src/app/session'
import { fakes } from '../app/fakes'
import { createPanelModel } from '../../src/ui/panel-model'
import { mountPanel, mountFinish } from '../../src/ui/mount'

const key = 'Abcdef1234567890', other = 'Zyxwvu9876543210'
const settle = async () => { for (let n = 0; n < 30; n++) await Promise.resolve() }
const record = (text = 'server') => ({ format: 1, revision: 1, name: 'Ada', draft: { file: 'draft.txt', etag: 'v1' }, sent: false, sentAt: null, updatedAt: '2026-11-15T20:00:00Z', items: [{ id: '0000000001', kind: 'overall', text, at: '2026-11-15T20:00:00Z' }] })

it.each(['changed quote', 'different main file'])('C1 preserves raw unplaced items after %s and an overall edit', async mode => {
  const f = fakes(), model = createPanelModel(), panel = document.createElement('aside')
  const raw = '{ "id":"0000000002", "kind":"comment", "file":"draft.txt", "from":6, "quote":{"exact":"beta","prefix":"alpha ","suffix":" gamma delta","extra":3}, "comments":[{"text":"<img src=x onerror=alert(1)>","at":"2026-11-15T20:00:00Z","extra":4}], "at":"2026-11-15T20:00:00Z", "unknown":{"keep":true} }'
  const review = JSON.stringify(record()).replace(/\[.*\]/, '[' + raw + ']')
  f.api.draft.mockResolvedValue({ main: mode === 'changed quote' ? 'draft.txt' : 'Appendix.txt', files: [{ file: mode === 'changed quote' ? 'draft.txt' : 'Appendix.txt', text: 'alpha edited gamma delta', etag: 'v2' }] })
  f.api.open.mockResolvedValue({ review: JSON.parse(review), revision: 1, rawReview: review })
  const s = new ReviewSession({ ...f.ports, panel: model }, { address: '', fragment: '#' + key })
  const unmount = mountPanel(panel, model, s)
  await s.start()
  expect(model.head.value.status).toBe('Saved')
  const section = panel.querySelector('section[aria-label="Could not place"]')
  expect(section?.querySelector('h2')?.textContent).toBe('Could not place')
  expect(panel.querySelector('[aria-label="Could not place"]')?.textContent).toContain('1 of your earlier items could not be placed; they stay in your review file.'); expect(panel.textContent).toContain('beta'); expect(panel.textContent).toContain('<img src=x onerror=alert(1)>'); expect(panel.querySelector('img')).toBeNull()
  s.setOverall('A new overall comment'); await f.advance(5000); await settle()
  expect(f.api.save.mock.lastCall![1]).toContain(raw)
  expect(JSON.parse(f.api.save.mock.lastCall![1]).items).toHaveLength(2)
  expect(model.head.value.status).toBe('Saved')
  s.dispose(); unmount()
})

it.each([
  ['beta', '  blue\n words ', 'blue words'],
  ['beta', '', ''],
  ['', 'inserted', 'inserted'],
  ['\n', ' ', ''],
])('shows an unplaced proposal as a card: %j to %j', async (quote, proposal, shown) => {
  const f = fakes(), model = createPanelModel(), panel = document.createElement('aside'), at = f.clock.now()
  const item = { id: '0000000002', kind: 'proposal', file: 'other.txt', from: 0, quote: { exact: quote, prefix: '', suffix: '' }, proposal, comments: [], at }
  f.api.open.mockResolvedValue({ review: { ...record(), items: [item] }, revision: 1 })
  const s = new ReviewSession({ ...f.ports, panel: model }, { address: '', fragment: '#' + key })
  const unmount = mountPanel(panel, model, s); await s.start()
  expect(model.unplaced.value[0]).toMatchObject({ proposal: shown })
  expect(panel.querySelector('del')?.textContent ?? '').toBe(quote.trim())
  expect(panel.querySelector('ins')?.textContent ?? '').toBe(shown)
  if (!quote.trim() && !shown) expect(panel.textContent).toContain('(line break)')
  s.dispose(); unmount()
})


it('lists unplaced items under a small summary heading and updates them live', async () => {
  const f = fakes(), model = createPanelModel(), panel = document.createElement('div')
  const s = new ReviewSession({ ...f.ports, panel: model })
  const unmount = mountFinish(panel, model, s)
  try {
    model.setStep('summary')
    model.setUnplaced([{ id: 'synthetic', quote: '<old>', proposal: '<new>', comments: [{ text: '<note>', at: f.clock.now() }] }])
    const section = panel.querySelector('[aria-label="Could not place"]')
    expect(section?.querySelector('h3')?.textContent).toBe('Could not place')
    expect(section?.querySelector('del')?.textContent).toBe('<old>')
    expect(section?.querySelector('ins')?.textContent).toBe('<new>')
    expect(section?.textContent).toContain('<note>')
    expect(section?.querySelector('note')).toBeNull()
    model.setUnplaced([])
    expect(panel.querySelector('[aria-label="Could not place"]')).toBeNull()
  } finally { s.dispose(); unmount() }
})
