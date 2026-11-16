import type { Diagnostic } from './diagnostic'
import type { Generated, Shape } from './generated'

const FILE = /file not found|failed to load file/i

const lineAt = (text: string, offset: number): number => {
	let line = 1
	for (let i = text.indexOf('\n'); i >= 0 && i < offset; i = text.indexOf('\n', i + 1)) line++
	return line
}

/** The proposals whose generated span touches the given lines. */
function onLines(g: Generated, lines: ReadonlySet<number>): Set<string> {
	const span = new Map<string, [number, number]>()
	for (const s of g.segments) {
		if (s.id === undefined) continue
		const at = span.get(s.id)
		span.set(s.id, [Math.min(at?.[0] ?? s.at, s.at), Math.max(at?.[1] ?? s.at, s.at + s.length)])
	}
	const hit = new Set<string>()
	for (const [id, [from, to]] of span) {
		const last = lineAt(g.text, Math.max(from, to - 1))
		for (let line = lineAt(g.text, from); line <= last; line++) if (lines.has(line)) { hit.add(id); break }
	}
	return hit
}

/**
 * The shape for the next compile after `diagnostics` failed this one (R12): proposals on an error's line are unwrapped, those already unwrapped left out;
 * an error naming no proposal moves every one a step.
 * 'file' when a file could not be read, which no proposal causes; 'draft' when nothing is left to change.
 */
export function nextShape(g: Generated, shape: Shape, diagnostics: readonly Diagnostic[]): Shape | 'draft' | 'file' {
	const errors = diagnostics.filter(d => d.severity === 'error')
	if (errors.some(d => FILE.test(d.message))) return 'file'
	if (!errors.length) return shape
	const lines = new Set(errors.flatMap(d => d.line === null ? [] : [d.line]))
	const named = onLines(g, lines)
	const targets = named.size ? named : new Set([...g.wrapped, ...g.unmarked])
	const unwrap = [...targets].filter(id => g.wrapped.has(id))
	if (unwrap.length) return { unwrap: new Set([...shape.unwrap, ...unwrap]), omit: shape.omit }
	const omit = [...targets].filter(id => g.unmarked.has(id))
	return omit.length ? { unwrap: shape.unwrap, omit: new Set([...shape.omit, ...omit]) } : 'draft'
}
