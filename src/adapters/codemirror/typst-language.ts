import { StreamLanguage } from '@codemirror/language'

/** Typst, token by token: enough for colour, not a parser. */
export const typstLanguage = StreamLanguage.define({
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
