import type { Op } from '../source/typst-parse'

type Run = { from: number; to: number; plain: boolean; line: boolean }

const runs = new WeakMap<readonly Op[], readonly Run[]>()

const PLAIN_TAGS = new Set(['p', 'strong', 'em'])
const isPlain = (top: Op | undefined): boolean =>
	top?.op === 'open' && (PLAIN_TAGS.has(top.tag) || top.cls === 'gr-h' || top.cls === 'gr-li' || (top.cls?.startsWith('gr-fn-') ?? false))

/** Every text op with whether its innermost open element is plain markup text, and whether a heading or list item holds it. */
function runsOf(ops: readonly Op[]): readonly Run[] {
	const known = runs.get(ops)
	if (known) return known
	const out: Run[] = []
	const stack: Op[] = []
	for (const op of ops) {
		if (op.op === 'open') stack.push(op)
		else if (op.op === 'close') stack.pop()
		else out.push({ from: op.from, to: op.to, plain: isPlain(stack[stack.length - 1]),
			line: stack.some(o => o.op === 'open' && (o.cls === 'gr-h' || o.cls === 'gr-li')) })
	}
	runs.set(ops, out)
	return out
}

function runAt(all: readonly Run[], pos: number): Run | undefined {
	let lo = 0, hi = all.length
	while (lo < hi) { const mid = (lo + hi) >>> 1; if (all[mid]!.to <= pos) lo = mid + 1; else hi = mid }
	const run = all[lo]
	return run && run.from <= pos ? run : undefined
}

const SYNTAX = /[\\[\]#$`*_<>@]/
const BLOCK_START = /^[ \t]*([=\-+/]|\d+\.[ \t])/
const BLOCK_AFTER_BREAK = /\n[ \t]*([=\-+/]|\d+\.)/
const BLANK_LINE = /\n[ \t]*\n/

/** Words that can sit inside a wrapper's brackets without starting markup or code. */
const safeWords = (words: string): boolean =>
	!SYNTAX.test(words) && !words.includes('//') && !words.includes('/*')
	&& !BLANK_LINE.test(words) && !BLOCK_START.test(words) && !BLOCK_AFTER_BREAK.test(words)

const backslashesBefore = (draft: string, at: number): number => {
	let n = 0
	while (at - n > 0 && draft[at - n - 1] === '\\') n++
	return n
}

/** Whether the proposal replacing draft[from, to) by `words` can be wrapped in a content block without changing the markup (R11). */
export function wrappable(draft: string, ops: readonly Op[], from: number, to: number, words: string): boolean {
	const old = draft.slice(from, to)
	if (!safeWords(old) || !safeWords(words) || backslashesBefore(draft, from) % 2 === 1) return false
	const all = runsOf(ops)
	let line = false
	if (from < to) {
		for (let pos = from; pos < to;) {
			const run = runAt(all, pos)
			if (!run?.plain) return false
			line ||= run.line
			pos = Math.min(to, run.to)
		}
	} else {
		for (const pos of [from - 1, from]) {
			if (pos < 0 || pos >= draft.length || draft[pos] === '\n') continue
			const run = runAt(all, pos)
			if (!run?.plain) return false
			line ||= run.line
		}
	}
	return !(line && (old.includes('\n') || words.includes('\n')))
}
