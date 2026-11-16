import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, options, render } from 'preact'
import { act } from 'preact/test-utils'
import type { CardView, HeadView } from '../../src/app/view'
import type { ReviewSession } from '../../src/app/session'
import { createPanelModel } from '../../src/ui/panel-model'
import { Card } from '../../src/ui/card'
import { Head } from '../../src/ui/head'
import { Panel } from '../../src/ui/panel'
import { mountHead, mountPanel } from '../../src/ui/mount'

const renderOptions = options as typeof options & { __r?: (vnode: { type: unknown; props: { id?: string } }) => void }

const head = (extra: Partial<HeadView> = {}): HeadView => ({ name: 'Ada', title: 'synthetic.typ', hasPdf: true, view: 'editor', pdfLook: 'changes', editable: true, canSend: true, status: '', form: null, ...extra })
const card = (id: string, extra: Partial<CardView> = {}): CardView => ({ id, kind: 'proposal', from: 0, shown: 'old', proposalShown: 'new', comments: [], editable: true, offPdf: false, unmarked: false, margin: false, ...extra })
const commands = () => ({ setName: vi.fn(), setView: vi.fn(), setPdfLook: vi.fn(), openForm: vi.fn(), cancelForm: vi.fn(), commentOn: vi.fn(), deleteComment: vi.fn(), undoProposal: vi.fn(), focusItem: vi.fn(), send: vi.fn(), setOverall: vi.fn(), showKeptChanges: vi.fn(), copyReviewLink: vi.fn() } satisfies Pick<ReviewSession, 'setName' | 'setView' | 'setPdfLook' | 'openForm' | 'cancelForm' | 'commentOn' | 'deleteComment' | 'undoProposal' | 'focusItem' | 'send' | 'setOverall' | 'showKeptChanges' | 'copyReviewLink'>)
let dispose: (() => void)[] = []
afterEach(() => { act(() => dispose.forEach(fn => fn())); dispose = []; document.body.replaceChildren() })
function slot() { const el = document.createElement('div'); document.body.append(el); return el }
function click(el: Element | null) { expect(el).not.toBeNull(); act(() => (el as HTMLElement).click()) }
function button(el: Element, text: string) { return [...el.querySelectorAll('button')].find(b => b.textContent === text) ?? null }
function setup() {
  const model = createPanelModel(), session = commands(), el = slot()
  act(() => { model.setHead(head()); model.upsertCard(card('a')); model.upsertCard(card('b', { kind: 'comment', shown: '<synthetic>', comments: [{ text: '<comment>', at: '2026-11-15T00:00:00Z' }] })); model.setOrder(['a', 'b']); model.setCount({ changes: 1, comments: 1 }); dispose.push(mountPanel(el, model, session)) })
  return { model, session, el }
}

describe('review islands', () => {
  it('returns drawn from every model update, including card insertion, replacement, and removal', () => {
    const model = createPanelModel(), session = commands(), el = slot(), header = slot()
    model.setHead(head()); model.upsertCard(card('a')); model.upsertCard(card('b')); model.setOrder(['a', 'b'])
    dispose.push(mountPanel(el, model, session), mountHead(header, model, session))
    act(() => {})
    const updates = [
      ['setHead', () => model.setHead(head({ status: 'Saved' }))],
      ['upsertCard inserts', () => model.upsertCard(card('c'))],
      ['upsertCard replaces', () => model.upsertCard(card('a', { proposalShown: 'changed' }))],
      ['removeCard', () => model.removeCard('b')],
      ['setOrder', () => model.setOrder(['c', 'a'])],
      ['setCount', () => model.setCount({ changes: 2, comments: 0 })],
    ] as const
    for (const [label, update] of updates) {
      // Even map-only updates must flush work queued by hand-built callers.
      model.head.value = head({ status: label === 'setHead' ? 'Pending' : 'Saved' })
      update()
      expect.soft(header.querySelector('#gr-status')?.textContent, label).toBe('Saved')
      act(() => { model.head.value = head({ status: '' }) })
    }
    expect(el.querySelector('[data-id="a"] ins')?.textContent).toBe('changed')
    expect([...el.querySelectorAll('li')].map(item => item.dataset.id)).toEqual(['c', 'a'])
    expect(el.querySelector('#gr-count')?.textContent).toBe('2 changes, 0 comments')
  })
  it('renders proposal and comment markup, safe text, and public card commands', () => {
    const { el, session } = setup()
    const a = el.querySelector('[data-id="a"]')!, b = el.querySelector('[data-id="b"]')!
    expect(a.tagName).toBe('LI'); expect(a.querySelector('.gr-card-head del')?.textContent).toBe('old'); expect(a.querySelector('ins')?.textContent).toBe('new')
    expect(b.querySelector('blockquote')?.textContent).toBe('<synthetic>'); expect(b.querySelector('.gr-comment')?.textContent).toBe('<comment> Delete'); expect(b.querySelector('comment')).toBeNull()
    click(a); expect(session.focusItem).toHaveBeenCalledWith('a'); session.focusItem.mockClear()
    click(button(a, 'Comment')); expect(session.openForm).toHaveBeenCalledWith({ id: 'a' })
    click(button(a, 'Undo change')); expect(session.undoProposal).toHaveBeenCalledWith('a')
    click(button(b, 'Add comment')); expect(session.openForm).toHaveBeenCalledWith({ id: 'b' })
    click(b.querySelector('button.gr-small')); expect(session.deleteComment).toHaveBeenCalledWith('b', 0)
    expect(session.focusItem).not.toHaveBeenCalled(); expect(button(b, 'Undo change')).toBeNull()
  })
  it('renders insertions, deletions, line breaks, and read-only cards', () => {
    const model = createPanelModel(), session = commands(), el = slot()
    for (const [id, extra] of Object.entries({ insert: { shown: '' }, delete: { proposalShown: '' }, line: { shown: '', proposalShown: '' }, sent: { editable: false, comments: [{ text: 'Kept', at: '' }] } })) model.upsertCard(card(id, extra))
    model.setOrder(['insert', 'delete', 'line', 'sent'])
    act(() => render(h(Panel, { model, session }), el)); dispose.push(() => render(null, el))
    expect(el.querySelector('[data-id="insert"] del')).toBeNull(); expect(el.querySelector('[data-id="delete"] ins')).toBeNull()
    expect(el.querySelector('[data-id="line"] .gr-card-head')?.textContent).toBe('(line break)')
    expect(el.querySelector('[data-id="sent"] button')).toBeNull()
  })
  it('updates only the changed card, moves keyed cards without rendering, and removes cards', () => {
    const renders: string[] = [], previous = renderOptions.__r
    renderOptions.__r = vnode => { if (vnode.type === Card && vnode.props.id) renders.push(vnode.props.id); previous?.(vnode) }
    try {
      const { model, el } = setup(), a = el.querySelector('[data-id="a"]'), b = el.querySelector('[data-id="b"]')
      renders.length = 0
      act(() => model.upsertCard(card('a', { proposalShown: 'changed' })))
      expect(renders).toEqual(['a']); expect(a?.querySelector('ins')?.textContent).toBe('changed')
      renders.length = 0
      act(() => model.setOrder(['b', 'a']))
      expect(renders).toEqual([]); expect([...el.querySelectorAll('li')]).toEqual([b, a])
      act(() => { model.removeCard('a'); model.setOrder(['b']) }); expect(el.querySelector('[data-id="a"]')).toBeNull()
      act(() => model.setCount({ changes: 0, comments: 1 })); expect(el.querySelector('#gr-count')?.textContent).toBe('0 changes, 1 comment')
    } finally { renderOptions.__r = previous }
  })
  it('shows the form quote without taking editor focus, focuses PDF forms, submits, and cancels', () => {
    const { model, session, el } = setup(), editor = document.createElement('input'); document.body.append(editor); editor.focus()
    const form = { target: { from: 1, to: 4 }, quote: 'raw #source', focus: false }
    act(() => model.setHead(head({ form })))
    expect(el.querySelector('#gr-form')?.hasAttribute('hidden')).toBe(false); expect(el.querySelector('#gr-hint')?.hasAttribute('hidden')).toBe(true)
    expect(el.querySelector('#gr-quote')?.textContent).toBe('raw #source'); expect(document.activeElement).toBe(editor)
    const textarea = el.querySelector<HTMLTextAreaElement>('#gr-comment')!
    act(() => { textarea.value = '  Synthetic note  '; textarea.dispatchEvent(new Event('input', { bubbles: true })) })
    act(() => model.setHead(head({ status: 'Saving…', form }))); expect(textarea.value).toBe('  Synthetic note  ')
    act(() => { el.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(session.commentOn).toHaveBeenCalledWith(form.target, 'Synthetic note')
    act(() => model.setHead(head({ form: { target: { id: 'a' }, quote: '', focus: true } })))
    expect(document.activeElement).toBe(textarea); expect(textarea.value).toBe('  Synthetic note  ')
    act(() => model.clearCommentDraft?.()); expect(el.querySelector('#gr-quote')?.textContent).toBe('(new words)')
    act(() => { el.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(session.commentOn).toHaveBeenCalledTimes(1)
    click(el.querySelector('#gr-cancel')); expect(session.cancelForm).toHaveBeenCalledOnce()
    act(() => model.setHead(head())); expect(el.querySelector('#gr-form')?.hasAttribute('hidden')).toBe(true)
  })
  it('keeps an unfinished name through head updates and commits non-blank names on change', () => {
    const model = createPanelModel(), session = commands(), el = slot()
    act(() => { model.setHead(head()); dispose.push(mountHead(el, model, session)) })
    const name = el.querySelector<HTMLInputElement>('#gr-name')!
    act(() => { name.value = 'Grace'; name.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(session.setName).not.toHaveBeenCalled()
    act(() => model.setHead(head({ status: 'Saved' })))
    expect(name.value).toBe('Grace')
    act(() => { name.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(session.setName).toHaveBeenCalledExactlyOnceWith('Grace')
    act(() => model.setHead(head({ name: 'Katherine' })))
    expect(name.value).toBe('Katherine')
    act(() => {
      name.value = '  Mary  '; name.dispatchEvent(new Event('input', { bubbles: true }))
      name.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(session.setName).toHaveBeenLastCalledWith('Mary')
    act(() => {
      name.value = '   '; name.dispatchEvent(new Event('input', { bubbles: true }))
      name.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(session.setName).toHaveBeenCalledTimes(3); expect(session.setName).toHaveBeenLastCalledWith('')
  })
  it('renders the head, view aria state, name and Send commands, and disabled Send', () => {
    const model = createPanelModel(), session = commands(), el = slot()
    act(() => { model.setHead(head()); dispose.push(mountHead(el, model, session)) })
    expect(el.querySelector('#gr-title.gr-title')?.textContent).toBe('synthetic.typ')
    expect(el.querySelector('#gr-view-editor')?.getAttribute('aria-pressed')).toBe('true')
    expect(el.querySelector('#gr-view-pdf')?.getAttribute('aria-pressed')).toBe('false')
    for (const mode of ['editor', 'pdf', 'both']) { click(el.querySelector('#gr-view-' + mode)); expect(session.setView).toHaveBeenLastCalledWith(mode) }
    const name = el.querySelector<HTMLInputElement>('#gr-name')!
    act(() => { name.value = 'Grace'; name.dispatchEvent(new Event('change', { bubbles: true })) }); expect(session.setName).toHaveBeenCalledWith('Grace')
    click(el.querySelector('#gr-send')); expect(session.send).toHaveBeenCalledOnce()
    act(() => model.setHead(head({ hasPdf: false, view: 'both', canSend: false, status: 'Review sent. Thank you.' })))
    expect(el.querySelector('.gr-views')?.hasAttribute('hidden')).toBe(true); expect(el.querySelector('#gr-view-both')?.getAttribute('aria-pressed')).toBe('true')
    expect(el.querySelector<HTMLButtonElement>('#gr-send')?.disabled).toBe(true); expect(el.querySelector('[role="status"]')?.textContent).toBe('Review sent. Thank you.')
  })
  it('renders the PDF look switch with Changes pressed, hidden in the editor view, and calling setPdfLook', () => {
    const model = createPanelModel(), session = commands(), el = slot()
    act(() => { model.setHead(head({ view: 'pdf' })); dispose.push(mountHead(el, model, session)) })
    const group = el.querySelector('.gr-pdf-look')!
    expect(group.getAttribute('role')).toBe('group'); expect(group.getAttribute('aria-label')).toBe('PDF shows'); expect(group.hasAttribute('hidden')).toBe(false)
    expect([...group.querySelectorAll('button')].map(b => b.textContent)).toEqual(['Original', 'Changes', 'New text'])
    expect(el.querySelector('#gr-pdf-look-original')?.getAttribute('aria-pressed')).toBe('false')
    click(el.querySelector('#gr-pdf-look-original')); expect(session.setPdfLook).toHaveBeenLastCalledWith('original')
    expect(el.querySelector('#gr-pdf-look-changes')?.getAttribute('aria-pressed')).toBe('true'); expect(el.querySelector('#gr-pdf-look-new')?.getAttribute('aria-pressed')).toBe('false')
    click(el.querySelector('#gr-pdf-look-new')); expect(session.setPdfLook).toHaveBeenLastCalledWith('new')
    act(() => model.setHead(head({ view: 'both', pdfLook: 'new' }))); expect(group.hasAttribute('hidden')).toBe(false); expect(el.querySelector('#gr-pdf-look-new')?.getAttribute('aria-pressed')).toBe('true')
    act(() => model.setHead(head({ view: 'editor' }))); expect(group.hasAttribute('hidden')).toBe(true)
    act(() => model.setHead(head({ view: 'pdf', hasPdf: false }))); expect(group.hasAttribute('hidden')).toBe(true)
  })
  it('shows the quiet PDF line on a row of its own after the controls and nothing when it is empty', () => {
    const model = createPanelModel(), el = slot()
    act(() => { model.setHead(head({ view: 'pdf', pdfNote: 'Showing your PDF while the draft compiles.' })); dispose.push(mountHead(el, model, commands())) })
    const line = el.querySelector('.gr-pdf-note-line')!
    expect(line.textContent).toBe('Showing your PDF while the draft compiles.')
    expect(line.parentElement).toBe(el.firstElementChild!.parentElement)
    expect(line.closest('.gr-pdf-look')).toBeNull()
    const order = [...el.children]
    expect(order.indexOf(line)).toBeGreaterThan(order.indexOf(el.querySelector('.gr-who')!))
    act(() => model.setHead(head({ view: 'pdf', pdfNote: '' }))); expect(el.querySelector('.gr-pdf-note-line')).toBeNull()
    act(() => model.setHead(head({ view: 'pdf' }))); expect(el.querySelector('.gr-pdf-note-line')).toBeNull()
  })
  it('supports direct head vnodes and disposes subscriptions in both mounts', () => {
    const model = createPanelModel(), session = commands(), el = slot(), panel = slot()
    act(() => render(h(Head, { model, session }), el)); act(() => render(null, el))
    let unmountHead!: () => void, unmountPanel!: () => void
    act(() => { unmountHead = mountHead(el, model, session); unmountPanel = mountPanel(panel, model, session) })
    act(() => { unmountHead(); unmountPanel(); model.setHead(head()); model.upsertCard(card('later')); model.setOrder(['later']) })
    expect(el.childNodes.length).toBe(0); expect(panel.childNodes.length).toBe(0)
  })
})


it('skips a name change when the trimmed name is unchanged', () => {
  const model = createPanelModel(), session = commands(), el = slot()
  act(() => { model.setHead(head()); dispose.push(mountHead(el, model, session)) })
  const name = el.querySelector<HTMLInputElement>('#gr-name')!
  act(() => { name.value = '  Ada  '; name.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(session.setName).not.toHaveBeenCalled()
})

describe('the off-PDF line', () => {
  it('shows the unmarked line only on a flagged card', () => {
    const el = slot()
    act(() => { const model = createPanelModel(); model.setHead(head()); model.upsertCard(card('a')); model.upsertCard(card('b', { unmarked: true })); model.setOrder(['a', 'b']); dispose.push(mountPanel(el, model, commands())) })
    expect(el.querySelector('[data-id="a"] .gr-unmarked')).toBeNull()
    expect(el.querySelector('[data-id="b"] .gr-unmarked')?.textContent).toBe('Shown without marks.')
    expect(el.querySelector('[data-id="b"] .gr-off-pdf')).toBeNull()
  })
  it('points a margin-marked unmarked card to the margin', () => {
    const el = slot()
    act(() => { const model = createPanelModel(); model.setHead(head()); model.upsertCard(card('b', { unmarked: true, margin: true })); model.setOrder(['b']); dispose.push(mountPanel(el, model, commands())) })
    expect(el.querySelector('[data-id="b"] .gr-unmarked')?.textContent).toBe('Shown without marks; see the margin.')
  })
  it('shows "Not shown on the PDF." only on a flagged card', () => {
    const model = createPanelModel(), el = slot()
    act(() => { model.setHead(head()); model.upsertCard(card('a')); model.upsertCard(card('b', { offPdf: true })); model.setOrder(['a', 'b']); dispose.push(mountPanel(el, model, commands())) })
    expect(el.querySelector('[data-id="a"] .gr-off-pdf')).toBeNull()
    expect(el.querySelector('[data-id="b"] .gr-off-pdf')?.textContent).toBe('Not shown on the PDF.')
  })
})
