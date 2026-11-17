// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { EditorView } from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'
import { redo, undo } from '@codemirror/commands'
import { syntaxTree } from '@codemirror/language'
import { ReviewSession } from '../../../src/app/session'
import { fakes } from '../../app/fakes'
import type { Change, EditorPort } from '../../../src/app/ports'

let editor: EditorPort
let view: EditorView
beforeEach(async () => {
  // As in gloss's find-bar tests, jsdom needs stubs for text measurement.
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => new DOMRect()
  const { createEditor } = await import('../../../src/adapters/codemirror/editor')
  editor = createEditor(document.body, { text: 'alpha beta\ngamma', language: 'typst', spellLanguage: 'de' })
  view = EditorView.findFromDOM(document.querySelector('.cm-editor')!)!
  editor.setEditable(true)
})
afterEach(() => { view?.destroy(); document.body.replaceChildren() })
const key = (key: string, options: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })
  view.contentDOM.dispatchEvent(event)
  return event
}

describe('CodeMirror editor port', () => {
  it('reports every range synchronously in old-text coordinates, without reading the whole document', () => {
    const report = vi.fn()
    editor.onEdit(report)
    const stringify = vi.spyOn(view.state.doc, 'toString')
    view.dispatch({ changes: [{ from: 0, to: 5, insert: 'A' }, { from: 11, to: 16, insert: 'G' }], userEvent: 'input.type' })
    expect(report.mock.calls).toEqual([[[{ from: 0, to: 5, insert: 'A' }, { from: 11, to: 16, insert: 'G' }]]])
    expect(stringify).not.toHaveBeenCalled()
    expect(editor.text()).toBe('A beta\nG')
  })

  it('reports two transactions in one tick separately and replays to the editor text', () => {
    const reports: (readonly Change[])[] = []
    editor.onEdit(changes => reports.push(changes))
    view.dispatch({ changes: { from: 0, to: 5, insert: 'A' } })
    view.dispatch({ changes: { from: 7, to: 12, insert: 'G' } })
    expect(reports).toEqual([[{ from: 0, to: 5, insert: 'A' }], [{ from: 7, to: 12, insert: 'G' }]])
    let replay = 'alpha beta\ngamma'
    for (const changes of reports) for (const change of [...changes].reverse()) {
      replay = replay.slice(0, change.from) + change.insert + replay.slice(change.to)
    }
    expect(editor.text()).toBe(replay)
  })

  it('also separates transactions passed in one dispatch', () => {
    const report = vi.fn()
    editor.onEdit(report)
    const first = view.state.update({ changes: { from: 0, to: 5, insert: 'A' } })
    const second = first.state.update({ changes: { from: 7, to: 12, insert: 'G' } })
    view.dispatch([first, second])
    expect(report.mock.calls).toEqual([[[{ from: 0, to: 5, insert: 'A' }]], [[{ from: 7, to: 12, insert: 'G' }]]])
  })

  it('sets text silently and outside undo history, while replacements are undoable', () => {
    const report = vi.fn()
    editor.onEdit(report)
    editor.setText('new draft')
    expect(report).not.toHaveBeenCalled()
    expect(undo(view)).toBe(false)
    editor.replace({ from: 0, to: 3, insert: 'fresh' })
    expect(editor.text()).toBe('fresh draft')
    expect(undo(view)).toBe(true)
    expect(editor.text()).toBe('new draft')
    expect(redo(view)).toBe(true)
    expect(editor.text()).toBe('fresh draft')
  })

  it('draws insertion marks and safe deleted text with item ids, then replaces them', () => {
    editor.setMarks([{ id: 'insert', from: 0, to: 5 }], [{ id: 'delete', at: 6, text: '<old>' }])
    expect(view.dom.querySelector('.gr-ins[data-items="insert"]')?.textContent).toBe('alpha')
    expect(view.dom.querySelector('del[data-items="delete"]')?.textContent).toBe('<old>')
    expect(view.dom.querySelector('del')?.children.length).toBe(0)
    editor.setMarks([], [])
    expect(view.dom.querySelector('.gr-ins, del')).toBeNull()
  })

  it('refuses user input when read-only but allows the application to set text', () => {
    editor.setEditable(false)
    const report = vi.fn()
    editor.onEdit(report)
    expect(view.contentDOM.getAttribute('contenteditable')).toBe('false')
    view.dispatch({ selection: { anchor: 0, head: 5 } })
    key('Backspace')
    view.dispatch({ changes: { from: 0, to: 5, insert: 'blocked' }, userEvent: 'input.type' })
    expect(editor.text()).toBe('alpha beta\ngamma')
    expect(report).not.toHaveBeenCalled()
    editor.setText('loaded draft')
    expect(editor.text()).toBe('loaded draft')
  })

  it('clamps scrolling to both ends of the document', () => {
    const dispatch = vi.spyOn(view, 'dispatch')
    editor.scrollTo(10000)
    const last = dispatch.mock.calls.at(-1)![0] as { effects: { value: { range: { head: number } } } }
    expect(last.effects.value.range.head).toBe(view.state.doc.length)
    expect(() => editor.scrollTo(-50)).not.toThrow()
  })

  it('opens search and replace at the top on Mod-f and go to line on Mod-Alt-g', () => {
    view.focus()
    key('f', { ctrlKey: true })
    expect(view.dom.querySelector('.cm-panels-top .cm-search')).not.toBeNull()
    expect(view.dom.querySelector('.cm-search input[name="replace"]')).not.toBeNull()
    key('Escape')
    view.focus()
    key('g', { ctrlKey: true, altKey: true })
    expect(view.dom.querySelector('.cm-goto-line')).not.toBeNull()
  })

  it('keeps line numbers, active lines, wrapping, spell language, brackets, and syntax colouring', () => {
    expect(view.dom.querySelector('.cm-lineNumbers')).not.toBeNull()
    expect(view.dom.querySelector('.cm-activeLine')).not.toBeNull()
    expect(view.dom.querySelector('.cm-activeLineGutter')).not.toBeNull()
    expect(view.contentDOM.classList.contains('cm-lineWrapping')).toBe(true)
    expect(view.contentDOM.getAttribute('spellcheck')).toBe('true')
    expect(view.contentDOM.lang).toBe('de')
    editor.setText('#let x = (1)')
    view.dispatch({ selection: { anchor: 10 } })
    expect(view.dom.querySelector('.cm-matchingBracket')).not.toBeNull()
    expect(syntaxTree(view.state).length).toBeGreaterThan(0)
    expect(view.dom.querySelector('.cm-line span')).not.toBeNull()
  })

  it('reports pointer selections and explicit Ctrl+Alt+M, ignoring Ctrl+A, Shift+Arrow, search, and programmatic selections', () => {
    const select = vi.fn(); editor.onSelect(select)
    view.focus(); key('a', { ctrlKey: true }); key('ArrowRight', { shiftKey: true })
    view.dispatch({ selection: EditorSelection.single(1, 5), userEvent: 'select.search' })
    view.dispatch({ selection: EditorSelection.single(0, 5) })
    expect(select).not.toHaveBeenCalled()
    view.contentDOM.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    expect(select).toHaveBeenLastCalledWith({ from: 0, to: 5 })
    expect(key('µ', { code: 'KeyM', ctrlKey: true, altKey: true }).defaultPrevented).toBe(true)
    expect(select).toHaveBeenCalledTimes(2)
  })
  it('reports refused keystrokes, paste, and input transactions without losing text silently', () => {
    const attempt = vi.fn(); editor.onAttempt?.(attempt); editor.setEditable(false)
    key('x'); view.contentDOM.dispatchEvent(new Event('paste', { bubbles: true }))
    view.dispatch({ changes: { from: 0, insert: 'x' }, userEvent: 'input.type' })
    expect(attempt).toHaveBeenCalledTimes(3)
    expect(editor.text()).toBe('alpha beta\ngamma')
  })

})

it('lets a read-only editor receive keys so it can explain refused input', () => {
  editor.setEditable(false)
  expect(view.contentDOM.tabIndex).toBe(0)
})
it.each(['Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Escape', 'Shift', 'Control', 'Alt', 'Meta'])('does not report editor navigation key %s as refused input', navigation => {
  const attempt = vi.fn(); editor.onAttempt?.(attempt); editor.setEditable(false)
  key(navigation); key(navigation, { shiftKey: true })
  expect(attempt).not.toHaveBeenCalled()
})
it.each(['x', 'Enter', 'Backspace', 'Delete'])('reports editor text key %s as refused input', textKey => {
  const attempt = vi.fn(); editor.onAttempt?.(attempt); editor.setEditable(false)
  const name = document.createElement('input'); document.body.append(name)
  editor.onAttempt?.(() => { attempt(); name.focus() })
  const event = key(textKey)
  expect(document.activeElement).toBe(name)
  expect(event.defaultPrevented).toBe(true)
  expect(name.value).toBe('')
  expect(attempt).toHaveBeenCalled()
})
it.each([['Backspace', 'alphabeta'], ['Delete', 'alpha eta']])('keeps normal editable %s and undo working', (textKey, expected) => {
  const attempt = vi.fn(); editor.onAttempt?.(attempt)
  editor.setText('alpha beta'); view.dispatch({ selection: { anchor: 6 } })
  key(textKey)
  expect(editor.text()).toBe(expected)
  expect(attempt).not.toHaveBeenCalled()
  expect(undo(view)).toBe(true)
  expect(editor.text()).toBe('alpha beta')
})

it('keeps read-only draft text readable despite Nextcloud disabled-control fading', () => {
  const styles = document.createElement('style')
  styles.textContent = '.cm-content[contenteditable="false"] { opacity: 0.5; }\n' + readFileSync('css/review.css', 'utf8')
  document.head.append(styles)
  document.querySelector('.cm-editor')!.parentElement!.classList.add('gr-text')
  try {
    editor.setEditable(false)
    expect(view.state.readOnly).toBe(true)
    expect(view.contentDOM.getAttribute('contenteditable')).toBe('false')
    expect(Number(getComputedStyle(view.contentDOM).opacity)).toBeGreaterThanOrEqual(0.8)
  } finally { styles.remove(); document.body.classList.remove('gr-text') }
})

it('keeps computed content size and line height equal in editable and read-only states', () => {
  const styles = document.createElement('style')
  styles.textContent = '.cm-content[contenteditable="false"] { font-size: 13px; line-height: 20px; }\n' + readFileSync('css/review.css', 'utf8')
  document.head.append(styles)
  view.dom.parentElement!.classList.add('gr-text')
  const typography = () => {
    const style = getComputedStyle(view.contentDOM)
    return { size: style.fontSize, pitch: style.lineHeight }
  }
  try {
    const editable = typography()
    expect(editable.size).not.toBe('')
    expect(editable.pitch).not.toBe('')
    editor.setEditable(false)
    expect(typography()).toEqual(editable)
  } finally { styles.remove() }
})

it.each([true, false])('handles the physical comment shortcut with editable=%s without editing or requesting a name', editable => {
  const attempt = vi.fn(), select = vi.fn(), edit = vi.fn()
  editor.setEditable(editable)
  editor.onAttempt?.(attempt); editor.onSelect(select); editor.onEdit(edit)
  view.dispatch({ selection: EditorSelection.single(0, 5) })
  expect(key('µ', { code: 'KeyM', ctrlKey: true, altKey: true }).defaultPrevented).toBe(true)
  expect(select).toHaveBeenCalledExactlyOnceWith({ from: 0, to: 5 })
  expect(attempt).not.toHaveBeenCalled()
  expect(edit).not.toHaveBeenCalled()
  expect(editor.text()).toBe('alpha beta\ngamma')
})


const largePaste = Array.from({ length: 300 }, (_, i) => `Synthetic paragraph ${i}: alpha beta gamma.\nA second synthetic line.\n`).join('\n')
it.each(['append', 'selection'] as const)('undoes and redoes a large multi-paragraph paste in one step: %s', mode => {
  const original = editor.text(), from = mode === 'append' ? original.length : 3, to = mode === 'append' ? from : 12
  view.dispatch({ changes: { from, to, insert: largePaste }, userEvent: 'input.paste' })
  const pasted = original.slice(0, from) + largePaste + original.slice(to)
  expect(editor.text()).toBe(pasted)
  expect(undo(view)).toBe(true); expect(editor.text()).toBe(original)
  expect(redo(view)).toBe(true); expect(editor.text()).toBe(pasted)
})

it.each([false, true])('preserves paste undo and redo through session save, with overlapping comment=%s', async commented => {
  const f = fakes(), session = new ReviewSession({ ...f.ports, editor })
  try {
    await session.start(); await session.setName('Ada')
    const original = editor.text()
    if (commented) session.commentOn({ from: 6, to: 10 }, 'Synthetic comment on beta')
    const setText = vi.spyOn(editor, 'setText')
    view.dispatch({ changes: { from: 3, to: 12, insert: largePaste }, userEvent: 'input.paste' })
    const pasted = original.slice(0, 3) + largePaste + original.slice(12)
    expect(editor.text()).toBe(pasted)
    await f.advance(5000)
    expect(f.api.save).toHaveBeenCalled()
    expect(f.head().status).toBe('Saved')
    expect(JSON.parse(f.api.save.mock.lastCall![1]).items.some((item: { kind: string }) => item.kind === 'proposal')).toBe(true)
    expect(setText).not.toHaveBeenCalled()
    expect(undo(view)).toBe(true); expect(editor.text()).toBe(original)
    await f.advance(5000)
    expect(redo(view)).toBe(true); expect(editor.text()).toBe(pasted)
    await f.advance(5000)
    expect(f.head().status).toBe('Saved')
    if (commented) expect(f.api.save.mock.lastCall![1]).toContain('Synthetic comment on beta')
    expect(setText).not.toHaveBeenCalled()
  } finally { session.dispose() }
})

it('preserves paste history when saving reconciles an editor and review mismatch', async () => {
  const f = fakes(), session = new ReviewSession({ ...f.ports, editor })
  try {
    await session.start(); await session.setName('Ada')
    const original = editor.text()
    session.commentOn({ from: 6, to: 10 }, 'Synthetic comment retained through reconciliation')
    // Simulate a missed edit notification so SessionSave.body must rebuild the review.
    editor.onEdit(() => {})
    view.dispatch({ changes: { from: 3, to: 12, insert: largePaste }, userEvent: 'input.paste' })
    const pasted = editor.text()
    session.setOverall('Synthetic save trigger')
    await f.advance(5000)
    expect(f.diagnostic).toHaveBeenCalledWith('The editor and review differed; the review was rebuilt.')
    expect(f.head().status).toBe('Saved')
    expect(f.api.save.mock.lastCall![1]).toContain('Synthetic comment retained through reconciliation')
    expect(undo(view)).toBe(true); expect(editor.text()).toBe(original)
    expect(redo(view)).toBe(true); expect(editor.text()).toBe(pasted)
  } finally { session.dispose() }
})
