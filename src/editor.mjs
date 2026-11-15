/**
 * The review editor: CodeMirror 6 on the draft's source, with the reviewer's proposals and comments drawn as decorations.
 * Exposed as window.GlossEditor.create(parent, {doc, lang, onChange}).
 */
import { EditorState, StateEffect, StateField, Compartment, Annotation } from '@codemirror/state'
import { EditorView, Decoration, WidgetType, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view'
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands'
import { StreamLanguage, HighlightStyle, syntaxHighlighting, bracketMatching } from '@codemirror/language'
import { stex } from '@codemirror/legacy-modes/mode/stex'
import { tags as t } from '@lezer/highlight'

/** Typst, token by token: enough for colour, not a parser. */
const typst = StreamLanguage.define({
	startState: () => ({ comment: false, raw: false, math: false }),
	token(stream, s) {
		if (s.comment) { if (stream.skipTo('*/')) { stream.match('*/'); s.comment = false } else stream.skipToEnd(); return 'comment' }
		if (s.raw) { if (stream.skipTo('```')) { stream.match('```'); s.raw = false } else stream.skipToEnd(); return 'string' }
		if (s.math) { if (stream.skipTo('$')) { stream.next(); s.math = false } else stream.skipToEnd(); return 'number' }
		if (stream.sol() && stream.match(/^\s*=+\s/)) { stream.skipToEnd(); return 'heading' }
		if (stream.match('//')) { stream.skipToEnd(); return 'comment' }
		if (stream.match('/*')) { s.comment = true; return 'comment' }
		if (stream.match('```')) { s.raw = true; return 'string' }
		if (stream.match(/^`[^`]*`/)) return 'string'
		if (stream.match('$')) { s.math = true; return 'number' }
		if (stream.match(/^#[\p{L}_][\p{L}\p{N}_.-]*/u)) return 'keyword'
		if (stream.match(/^<[\p{L}\p{N}_:.-]+>/u)) return 'atom'
		if (stream.match(/^@[\p{L}\p{N}_:.-]+/u)) return 'link'
		if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return 'string'
		if (stream.match(/^\*[^*\n]+\*/)) return 'strong'
		if (stream.match(/^_[^_\n]+_/)) return 'emphasis'
		if (stream.match(/^[[\](){}]/)) return 'bracket'
		if (stream.eatWhile(/[^#/<@$*_`"[\](){}\\]/)) return null
		stream.next(); return null
	},
})

const languages = { typst: () => typst, latex: () => StreamLanguage.define(stex), markdown: () => [], plain: () => [] }

const style = HighlightStyle.define([
	{ tag: t.heading, fontWeight: 'bold', color: 'var(--gr-c-heading)' },
	{ tag: t.keyword, color: 'var(--gr-c-keyword)' },
	{ tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--gr-c-comment)', fontStyle: 'italic' },
	{ tag: t.string, color: 'var(--gr-c-string)' },
	{ tag: t.number, color: 'var(--gr-c-math)' },
	{ tag: [t.atom, t.link], color: 'var(--gr-c-ref)' },
	{ tag: t.strong, fontWeight: 'bold' },
	{ tag: t.emphasis, fontStyle: 'italic' },
	{ tag: [t.bracket, t.tagName, t.meta], color: 'var(--gr-c-comment)' },
])

class Deleted extends WidgetType {
	constructor(text, id) { super(); this.text = text; this.id = id }
	eq(o) { return o.text === this.text && o.id === this.id }
	toDOM() {
		const d = document.createElement('del'); d.textContent = this.text; d.dataset.items = this.id
		return d
	}
	ignoreEvent() { return false }
}

const setDecos = StateEffect.define()
const decoField = StateField.define({
	create: () => Decoration.none,
	update(decos, tr) {
		decos = decos.map(tr.changes)
		for (const e of tr.effects) if (e.is(setDecos)) decos = e.value
		return decos
	},
	provide: f => EditorView.decorations.from(f),
})
const external = Annotation.define()

const create = (parent, { doc, lang, spellLang, onChange }) => {
	const editable = new Compartment()
	const view = new EditorView({
		parent,
		state: EditorState.create({
			doc,
			extensions: [
				lineNumbers(), highlightActiveLine(), highlightActiveLineGutter(), history(), bracketMatching(),
				search({ top: true }), highlightSelectionMatches(),
				keymap.of([...searchKeymap, ...defaultKeymap, ...historyKeymap]), EditorView.lineWrapping,
				EditorView.contentAttributes.of({ spellcheck: 'true', lang: spellLang || 'en' }),
				(languages[lang] || languages.plain)(), syntaxHighlighting(style), decoField,
				editable.of([EditorView.editable.of(false), EditorState.readOnly.of(true)]),
				EditorView.updateListener.of(u => {
					if (u.docChanged && !u.transactions.some(tr => tr.annotation(external))) {
						const text = u.state.doc.toString()
						queueMicrotask(() => onChange(text))
					}
				}),
			],
		}),
	})
	return {
		view,
		text: () => view.state.doc.toString(),
		/** Replaces the whole text, outside the undo history and without onChange. */
		setDoc(text) {
			view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, annotations: [external.of(true)] })
		},
		/** Replaces [from, to) as if the reviewer typed it: undoable, and onChange follows. */
		replace(from, to, insert) { view.dispatch({ changes: { from, to, insert }, userEvent: 'input' }) },
		/** marks: [{from, to, cls, id}]; deleted: [{at, text, id}]. */
		setDecos(marks, deleted) {
			const len = view.state.doc.length
			const ranges = [
				...marks.filter(m => m.to > m.from && m.to <= len)
					.map(m => Decoration.mark({ class: m.cls, attributes: { 'data-items': m.id } }).range(m.from, m.to)),
				...deleted.filter(d => d.at <= len)
					.map(d => Decoration.widget({ widget: new Deleted(d.text, d.id), side: -1 }).range(d.at)),
			]
			view.dispatch({ effects: setDecos.of(Decoration.set(ranges, true)) })
		},
		setEditable(on) {
			view.dispatch({ effects: editable.reconfigure([EditorView.editable.of(on), EditorState.readOnly.of(!on)]) })
		},
		selection() { const r = view.state.selection.main; return [r.from, r.to] },
		scrollTo(pos) { view.dispatch({ effects: EditorView.scrollIntoView(Math.min(pos, view.state.doc.length), { y: 'center' }) }) },
	}
}

window.GlossEditor = { create }
