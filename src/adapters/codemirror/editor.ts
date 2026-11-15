import { Annotation, Compartment, EditorState, StateEffect, StateField, Transaction } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, type DecorationSet } from '@codemirror/view'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { StreamLanguage, bracketMatching, syntaxHighlighting } from '@codemirror/language'
import { stex } from '@codemirror/legacy-modes/mode/stex'
import type { Change, EditorPort } from '../../app/ports'
import { reviewHighlight } from './highlight'
import { typstLanguage } from './typst-language'

class Deleted extends WidgetType {
  constructor(readonly text: string, readonly id: string) { super() }
  eq(other: Deleted): boolean { return other.text === this.text && other.id === this.id }
  toDOM(view: EditorView): HTMLElement {
    const element = view.dom.ownerDocument.createElement('del')
    element.textContent = this.text
    element.dataset.items = this.id
    return element
  }
  ignoreEvent(): boolean { return false }
}

const setDecorations = StateEffect.define<DecorationSet>()
const decorations = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    value = value.map(transaction.changes)
    for (const effect of transaction.effects) if (effect.is(setDecorations)) value = effect.value
    return value
  },
  provide: field => EditorView.decorations.from(field),
})
const external = Annotation.define<boolean>()

export function createEditor(parent: HTMLElement, options: { text: string; language: string; spellLanguage: string }): EditorPort {
  const editable = new Compartment()
  let onEdit: (changes: readonly Change[]) => void = () => {}
  let onSelect: (range: { from: number; to: number }) => void = () => {}
  const language = options.language === 'typst' ? typstLanguage
    : options.language === 'latex' ? StreamLanguage.define(stex) : []
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: options.text,
      extensions: [
        lineNumbers(), highlightActiveLine(), highlightActiveLineGutter(), history(), bracketMatching(),
        search({ top: true }), highlightSelectionMatches(),
        keymap.of([...searchKeymap, ...defaultKeymap, ...historyKeymap]), EditorView.lineWrapping,
        EditorView.contentAttributes.of({ spellcheck: 'true', lang: options.spellLanguage || 'en' }),
        language, syntaxHighlighting(reviewHighlight), decorations,
        editable.of([EditorView.editable.of(false), EditorState.readOnly.of(true)]),
        EditorState.transactionFilter.of(transaction =>
          transaction.docChanged && transaction.startState.readOnly && !transaction.annotation(external)
            && transaction.isUserEvent('input') ? [] : transaction),
        EditorView.updateListener.of(update => {
          // Each transaction has its own old-text coordinates, including in a batched dispatch.
          for (const transaction of update.transactions) {
            if (!transaction.docChanged || transaction.annotation(external)) continue
            const changes: Change[] = []
            transaction.changes.iterChanges((from, to, _newFrom, _newTo, inserted) => {
              changes.push({ from, to, insert: inserted.toString() })
            })
            onEdit(changes)
          }
          const range = update.state.selection.main
          if (update.selectionSet && !range.empty) onSelect({ from: range.from, to: range.to })
        }),
      ],
    }),
  })
  return {
    text: () => view.state.doc.toString(),
    setText(text) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        annotations: [external.of(true), Transaction.addToHistory.of(false)],
      })
    },
    replace(change) { view.dispatch({ changes: change, userEvent: 'input' }) },
    setMarks(marks, deleted) {
      const length = view.state.doc.length
      const ranges = [
        ...marks.filter(mark => mark.from >= 0 && mark.to > mark.from && mark.to <= length)
          .map(mark => Decoration.mark({ class: 'gr-ins', attributes: { 'data-items': mark.id } }).range(mark.from, mark.to)),
        ...deleted.filter(words => words.at >= 0 && words.at <= length)
          .map(words => Decoration.widget({ widget: new Deleted(words.text, words.id), side: -1 }).range(words.at)),
      ]
      view.dispatch({ effects: setDecorations.of(Decoration.set(ranges, true)) })
    },
    setEditable(on) {
      view.dispatch({ effects: editable.reconfigure([EditorView.editable.of(on), EditorState.readOnly.of(!on)]) })
    },
    scrollTo(pos) {
      view.dispatch({ effects: EditorView.scrollIntoView(Math.max(0, Math.min(pos, view.state.doc.length)), { y: 'center' }) })
    },
    onEdit(listener) { onEdit = listener },
    onSelect(listener) { onSelect = listener },
  }
}
