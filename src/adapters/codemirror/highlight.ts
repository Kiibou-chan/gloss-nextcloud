import { HighlightStyle } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

export const reviewHighlight = HighlightStyle.define([
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
