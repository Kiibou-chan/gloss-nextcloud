/** The index just past the string that opens at i (a quote), or the source's end if it never closes. */
export const skipString = (src: string, i: number): number => {
	let j = i + 1
	while (j < src.length && src[j] !== '"') { if (src[j] === '\\') j++; j++ }
	return Math.min(j + 1, src.length)
}

/** The index just past the comment that opens at i, the newline ending a line comment staying outside it; i itself if none opens there. */
export const skipComment = (src: string, i: number): number => {
	if (src[i] !== '/') return i
	if (src[i + 1] === '/') { const nl = src.indexOf('\n', i); return nl < 0 ? src.length : nl }
	if (src[i + 1] === '*') { const end = src.indexOf('*/', i + 2); return end < 0 ? src.length : end + 2 }
	return i
}

/** The position just past the bracket that closes the one at i, skipping strings; the source's end if none. */
export const skipBalanced = (src: string, i: number): number => {
	const open = src[i]!; const close = ({ '(': ')', '[': ']', '{': '}' } as Record<string, string>)[open]
	let depth = 0
	for (let j = i; j < src.length; j++) {
		const c = src[j]
		if (c === '"') { j = skipString(src, j) - 1; continue }
		if (c === open) depth++
		else if (c === close && --depth === 0) return j + 1
	}
	return src.length
}

/** The end of a statement line, carried over further lines while a bracket is open. */
export const statementEnd = (src: string, i: number): number => {
	let j = i
	while (j < src.length && src[j] !== '\n') {
		if ('([{'.includes(src[j]!)) { j = skipBalanced(src, j); continue }
		if (src[j] === '"') { j = skipString(src, j); continue }
		j++
	}
	return j
}
