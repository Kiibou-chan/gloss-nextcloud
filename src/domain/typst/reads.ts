import { skipComment, skipString } from '../source/typst-scan'

const CALLS = new Set(['bibliography', 'read', 'image', 'json', 'csv', 'yaml', 'toml', 'xml', 'cbor'])
const WORD = /[A-Za-z0-9_-]/

type Use = { kind: 'call' | 'import' | 'include'; paths: string[] }

const unescape = (literal: string): string => literal.slice(1, -1).replace(/\\(.)/g, '$1')

/** The string literal at i, if one closes on its line; markup quotes are plain characters. */
const literalAt = (src: string, i: number): { text: string; end: number } | null => {
	if (src[i] !== '"') return null
	const end = skipString(src, i)
	const raw = src.slice(i, end)
	return raw.length > 1 && raw.endsWith('"') && !raw.includes('\n') ? { text: unescape(raw), end } : null
}

const space = (src: string, i: number): number => { while (src[i] === ' ' || src[i] === '\t') i++; return i }

/** The strings of a call's first argument: one literal, or the literals of an array. */
const firstArgument = (src: string, i: number): string[] => {
	i = space(src, i)
	const one = literalAt(src, i)
	if (one) return [one.text]
	if (src[i] !== '(') return []
	const paths: string[] = []
	for (i = space(src, i + 1); ; i = space(src, i)) {
		const lit = literalAt(src, i)
		if (!lit) return paths
		paths.push(lit.text)
		i = space(src, lit.end)
		if (src[i] !== ',') return paths
		i++
	}
}

function uses(src: string): Use[] {
	const found: Use[] = []
	for (let i = 0; i < src.length;) {
		const next = skipComment(src, i)
		if (next > i) { i = next; continue }
		const c = src[i]!
		if (c === '"') {
			const end = skipString(src, i)
			i = src.slice(i, end).includes('\n') ? i + 1 : end
			continue
		}
		if (!/[A-Za-z]/.test(c) || (i > 0 && (WORD.test(src[i - 1]!) || src[i - 1] === '.'))) { i++; continue }
		let j = i
		while (j < src.length && WORD.test(src[j]!)) j++
		const name = src.slice(i, j)
		if ((name === 'import' || name === 'include') && src[i - 1] === '#') {
			const lit = literalAt(src, space(src, j))
			if (lit) found.push({ kind: name, paths: [lit.text] })
		} else if (CALLS.has(name) && src[j] === '(') found.push({ kind: 'call', paths: firstArgument(src, j + 1) })
		i = j
	}
	return found
}

const isPackage = (path: string): boolean => path.startsWith('@')

function resolve(file: string, path: string): string | null {
	const parts = path.startsWith('/') ? [] : file.split('/').slice(0, -1)
	for (const part of path.split('/')) {
		if (part === '' || part === '.') continue
		if (part === '..') { if (!parts.length) return null; parts.pop() } else parts.push(part)
	}
	return parts.length ? parts.join('/') : null
}

/** Root-relative, normalised, deduplicated paths that `file` reads; a path leaving the shared folder is dropped. */
export function typstReads(file: string, text: string): string[] {
	const out = new Set<string>()
	for (const use of uses(text)) for (const path of use.paths) {
		if (isPackage(path)) continue
		const resolved = resolve(file, path)
		if (resolved) out.add(resolved)
	}
	return [...out]
}

/** An #import or #include of "@namespace/...", outside comments. */
export function importsPackage(text: string): boolean {
	return uses(text).some(use => use.kind !== 'call' && isPackage(use.paths[0]!))
}
