// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorView } from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'
import { redo, undo } from '@codemirror/commands'
import { syntaxTree } from '@codemirror/language'
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
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }))
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

  it('reports non-empty selections for the comment form', () => {
    const select = vi.fn()
    editor.onSelect(select)
    view.dispatch({ selection: EditorSelection.single(1, 5) })
    expect(select).toHaveBeenCalledWith({ from: 1, to: 5 })
    view.dispatch({ selection: { anchor: 0 } })
    expect(select).toHaveBeenCalledTimes(1)
  })

})
