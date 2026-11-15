/**
 * A readable view of Typst source: headings, paragraphs, list items, strong, emphasis, raw, and math, with markup,
 * comments, labels, and code hidden. Every shown character is the source's own character, so a text node's offset in
 * the view plus its data-from is its offset in the source.
 *
 * parse(src) returns a flat list of ops: {op: 'open', tag, cls}, {op: 'close'}, {op: 'text', from, to}.
 */
window.GlossTypst = (() => {
	const STATEMENT = /^[ \t]*#(set|show|import|let|include|pagebreak|bibliography|outline)\b/
	const HEADING = /^[ \t]*(=+)[ \t]+/
	const ITEM = /^[ \t]*([-+]|\d+\.)[ \t]+/
	const BLANK = /^[ \t]*(\n|$)/
	const IDENT = /^[A-Za-z_][\w-]*(\.[A-Za-z_][\w-]*)*/
	const LABEL = /^<[\w:.-]+>/
	const REF = /^@[\w:.-]*[\w]/

	/** The position just past the bracket that closes the one at i, skipping strings; the source's end if none. */
	const skipBalanced = (src, i) => {
		const open = src[i]; const close = { '(': ')', '[': ']', '{': '}' }[open]
		let depth = 0
		for (let j = i; j < src.length; j++) {
			const c = src[j]
			if (c === '"') { j++; while (j < src.length && src[j] !== '"') { if (src[j] === '\\') j++; j++ } continue }
			if (c === open) depth++
			else if (c === close && --depth === 0) return j + 1
		}
		return src.length
	}

	/** The end of a statement line, carried over further lines while a bracket is open. */
	const statementEnd = (src, i) => {
		let j = i
		while (j < src.length && src[j] !== '\n') {
			if ('([{'.includes(src[j])) { j = skipBalanced(src, j); continue }
			if (src[j] === '"') { j++; while (j < src.length && src[j] !== '"') { if (src[j] === '\\') j++; j++ } }
			j++
		}
		return j
	}

	const parse = src => {
		const ops = []
		const stack = [] // open elements: {kind: 'p'|'h'|'li'|'strong'|'em'|'content'}
		let textFrom = -1
		const flush = to => { if (textFrom >= 0 && to > textFrom) ops.push({ op: 'text', from: textFrom, to }); textFrom = -1 }
		const show = i => { if (textFrom < 0) textFrom = i }
		const open = (kind, tag, cls) => { ops.push({ op: 'open', tag, cls }); stack.push(kind) }
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
					flush(i); closeBlock(); open('h', 'h' + Math.min(6, m[1].length + 1), 'gr-h')
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
			if (c === '/' && src[i + 1] === '/') {
				flush(i)
				const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl; continue
			}
			if (c === '/' && src[i + 1] === '*') {
				flush(i)
				const end = src.indexOf('*/', i + 2); i = end < 0 ? src.length : end + 2; continue
			}
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
					ops.push({ op: 'text', from, to: from + key[1].length }); closeTop()
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
	const dropBlankParagraphs = (src, ops) => {
		const out = []
		for (let i = 0; i < ops.length; i++) {
			if (ops[i].op === 'open' && ops[i].tag === 'p') {
				let j = i + 1
				while (j < ops.length && ops[j].op === 'text' && !src.slice(ops[j].from, ops[j].to).trim()) j++
				if (ops[j]?.op === 'close') { i = j; continue }
			}
			out.push(ops[i])
		}
		return out
	}

	/**
	 * The view in el. marks: [{from, to, n, cls}] source ranges, drawn as classes and data-items on the text pieces they
	 * cover; dels: [{at, text}] struck text shown before source offset at, not editable and not part of the source.
	 */
	const render = (el, src, ops, marks = [], dels = []) => {
		el.replaceChildren()
		const parents = [el]
		const pendingDels = [...dels].sort((a, b) => a.at - b.at)
		const emitDels = (top, upTo) => {
			while (pendingDels.length && pendingDels[0].at <= upTo) {
				const d = pendingDels.shift()
				const e = document.createElement('del'); e.contentEditable = 'false'; e.textContent = d.text
				if (d.n !== undefined) e.dataset.items = String(d.n)
				top.append(e)
			}
		}
		const piece = (from, to) => {
			const span = document.createElement('span')
			span.dataset.from = String(from); span.dataset.to = String(to)
			span.textContent = src.slice(from, to)
			const on = marks.filter(m => m.from < to && m.to > from)
			if (on.length) {
				span.className = [...new Set(on.map(m => m.cls || 'gr-m'))].join(' ')
				span.dataset.items = on.map(m => m.n).join(' ')
			}
			return span
		}
		for (const o of ops) {
			const top = parents[parents.length - 1]
			if (o.op === 'open') {
				const e = document.createElement(o.tag); if (o.cls) e.className = o.cls
				top.append(e); parents.push(e)
			} else if (o.op === 'close') parents.pop()
			else {
				const cuts = new Set([o.from, o.to])
				for (const m of marks) for (const c of [m.from, m.to]) if (c > o.from && c < o.to) cuts.add(c)
				for (const d of pendingDels) if (d.at > o.from && d.at < o.to) cuts.add(d.at)
				const points = [...cuts].sort((a, b) => a - b)
				for (let i = 0; i + 1 < points.length; i++) {
					emitDels(top, points[i])
					top.append(piece(points[i], points[i + 1]))
				}
			}
		}
		emitDels(el.lastElementChild || el, Infinity)
	}

	/** The source offset of a DOM position inside a view render() drew; null outside shown text. */
	const sourceOffset = (node, offset) => {
		if (node.nodeType === Node.TEXT_NODE) {
			const span = node.parentElement?.closest('[data-from]')
			return span ? Number(span.dataset.from) + offset : null
		}
		const child = node.childNodes[offset]
		const walker = document.createTreeWalker(child ?? node, NodeFilter.SHOW_TEXT)
		const first = child ? walker.nextNode() : null
		if (first) return sourceOffset(first, 0)
		const spans = node.querySelectorAll?.('[data-from]')
		const last = spans?.[spans.length - 1]
		return last ? Number(last.dataset.from) + last.textContent.length : null
	}

	return { parse, render, sourceOffset }
})()
