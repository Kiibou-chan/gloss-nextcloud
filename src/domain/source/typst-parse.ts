/** Ported from the spike's js/typst-view.js parse and dropBlankParagraphs. */
import { skipBalanced, skipComment, statementEnd } from './typst-scan'
export type Op =
  | { readonly op: 'open'; readonly tag: string; readonly cls?: string }
  | { readonly op: 'close' }
  | { readonly op: 'text'; readonly from: number; readonly to: number };

/** The plain view shows every source character, including markup. */
export const plainOps = (src: string): Op[] => [
  { op: 'open', tag: 'div', cls: 'gr-plain' },
  { op: 'text', from: 0, to: src.length },
  { op: 'close' },
];

const STATEMENT = /^[ \t]*#(set|show|import|let|include|pagebreak|bibliography|outline)\b/
const HEADING = /^[ \t]*(=+)[ \t]+/
const ITEM = /^[ \t]*([-+]|\d+\.)[ \t]+/
const BLANK = /^[ \t]*(\n|$)/
const IDENT = /^[A-Za-z_][\w-]*(\.[A-Za-z_][\w-]*)*/
const LABEL = /^<[\w:.-]+>/
const REF = /^@[\w:.-]*[\w]/

export const parseTypst = (src: string): Op[] => {
	const ops: Op[] = []
	const stack: string[] = [] // open elements: {kind: 'p'|'h'|'li'|'strong'|'em'|'content'}
	let textFrom = -1
	const flush = (to: number) => { if (textFrom >= 0 && to > textFrom) ops.push({ op: 'text', from: textFrom, to }); textFrom = -1 }
	const show = (i: number) => { if (textFrom < 0) textFrom = i }
	const open = (kind: string, tag: string, cls?: string) => { ops.push({ op: 'open', tag, ...(cls === undefined ? {} : { cls }) }); stack.push(kind) }
	const closeTop = () => { ops.push({ op: 'close' }); stack.pop() }
	const closeBlock = () => { while (stack.length) closeTop() }
	const closeLine = () => {
		const at = stack.findIndex(k => k === 'h' || k === 'li')
		if (at >= 0) while (stack.length > at) closeTop()
	}
	const ensureBlock = () => { if (!stack.length) open('p', 'p') }

	let i = 0
	let lineStart = true
	while (i < src.length) {
		if (lineStart) {
			lineStart = false
			const rest = src.slice(i)
			let m
			if (BLANK.test(rest)) {
				flush(i); closeBlock()
				const nl = src.indexOf('\n', i)
				i = nl < 0 ? src.length : nl + 1; lineStart = true; continue
			}
			if (STATEMENT.test(rest)) {
				flush(i)
				const end = statementEnd(src, i)
				i = end < src.length ? end + 1 : end; lineStart = true; continue
			}
			if ((m = HEADING.exec(rest))) {
				flush(i); closeBlock(); open('h', 'h' + Math.min(6, m[1]!.length + 1), 'gr-h')
				i += m[0].length; continue
			}
			if ((m = ITEM.exec(rest))) {
				flush(i); closeBlock(); open('li', 'div', 'gr-li')
				i += m[0].length; continue
			}
		}
		const c = src[i]
		const rest = src.slice(i, i + 200)
		let m
		if (c === '\n') {
			const inLine = stack.some(k => k === 'h' || k === 'li')
			if (inLine) { flush(i); closeLine(); i++; lineStart = true; continue }
			ensureBlock(); show(i); i++; lineStart = true; continue
		}
		if (c === '/' && skipComment(src, i) > i) { flush(i); i = skipComment(src, i); continue }
		if (c === '\\' && i + 1 < src.length && src[i + 1] !== '\n') {
			flush(i); ensureBlock(); show(i + 1); i += 2; continue
		}
		if (c === '*' || c === '_') {
			const kind = c === '*' ? 'strong' : 'em'
			flush(i)
			if (stack[stack.length - 1] === kind) closeTop()
			else { ensureBlock(); open(kind, kind) }
			i++; continue
		}
		if (c === '`' || c === '$') {
			const end = src.indexOf(c, i + 1)
			if (end > i) {
				flush(i); ensureBlock(); open('raw', 'code', c === '$' ? 'gr-math' : 'gr-raw')
				ops.push({ op: 'text', from: i + 1, to: end }); closeTop()
				i = end + 1; continue
			}
		}
		if (c === '<' && (m = LABEL.exec(rest))) { flush(i); i += m[0].length; continue }
		if (c === '@' && (m = REF.exec(rest))) {
			flush(i); ensureBlock(); open('ref', 'span', 'gr-ref')
			ops.push({ op: 'text', from: i, to: i + m[0].length }); closeTop()
			i += m[0].length; continue
		}
		if (c === '#' && (m = IDENT.exec(src.slice(i + 1, i + 101)))) {
			flush(i)
			let j = i + 1 + m[0].length
			const key = m[0] === 'cite' && src[j] === '(' ? /^\(\s*<([\w:.-]+)>/.exec(src.slice(j, j + 100)) : null
			if (key) {
				const from = j + key[0].indexOf('<') + 1
				ensureBlock(); open('ref', 'span', 'gr-ref')
				ops.push({ op: 'text', from, to: from + key[1]!.length }); closeTop()
			}
			if (src[j] === '(') j = skipBalanced(src, j)
			if (src[j] === '[') { ensureBlock(); open('content', 'span', 'gr-fn-' + m[0].replace(/\W/g, '-')); i = j + 1; continue }
			i = j; continue
		}
		if (c === ']' && stack[stack.length - 1] === 'content') { flush(i); closeTop(); i++; continue }
		ensureBlock(); show(i); i++
	}
	flush(src.length); closeBlock()
	return dropBlankParagraphs(src, ops)
}

/** ops without paragraphs that show only whitespace, as a figure or a label alone on its lines leaves. */
const dropBlankParagraphs = (src: string, ops: readonly Op[]): Op[] => {
	const out: Op[] = []
	for (let i = 0; i < ops.length; i++) {
		const op = ops[i]!
		if (op.op === 'open' && op.tag === 'p') {
			let j = i + 1
			while (j < ops.length) {
				const next = ops[j]!
				if (next.op !== 'text' || src.slice(next.from, next.to).trim()) break
				j++
			}
			if (ops[j]?.op === 'close') { i = j; continue }
		}
		out.push(op)
	}
	return out
}
