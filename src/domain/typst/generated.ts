import type { DraftReview } from '../review/draft-review'
import type { Op } from '../source/typst-parse'
import { wrappable } from './wrap-rule'

/** `span` is, for new words, the length of the draft range they replace. */
type Segment = { at: number; length: number; draft: number; kind: 'copy' | 'old' | 'new' | 'syntax'; id?: string; span?: number }
export type Generated = { text: string; segments: readonly Segment[]; wrapped: ReadonlySet<string>; unmarked: ReadonlySet<string>; omitted: ReadonlySet<string> }
export type Shape = { unwrap: ReadonlySet<string>; omit: ReadonlySet<string> }

const DIFF_PRELUDE = '#let gloss-review-del(body) = text(fill: rgb("#c0392b"), strike(body))\n'
	+ '#let gloss-review-ins(body) = text(fill: rgb("#1a7f37"), underline(highlight(fill: rgb("#dcf5e3"), body)))\n'
const NEW_PRELUDE = '#let gloss-review-new(body) = highlight(fill: rgb("#fff3b0"), body)\n'

function build(review: DraftReview, draft: string, ops: readonly Op[], shape: Shape, mode: 'diff' | 'new'): Generated {
	const prelude = mode === 'diff' ? DIFF_PRELUDE : NEW_PRELUDE
	const segments: Segment[] = [{ at: 0, length: prelude.length, draft: 0, kind: 'syntax' }]
	const wrapped = new Set<string>(), unmarked = new Set<string>(), omitted = new Set<string>()
	let genEnd = prelude.length, draftEnd = 0
	const copy = (to: number, from: number): void => {
		if (to > genEnd) segments.push({ at: genEnd, length: to - genEnd, draft: draftEnd, kind: 'copy' })
		genEnd = from
	}
	const text = prelude + review.rewrite((p, rel) => {
		const start = prelude.length + rel, old = p.quote.exact
		copy(start, start)
		let out = ''
		const add = (s: string, kind: Segment['kind'], more: Partial<Segment> = {}): void => {
			segments.push({ at: start + out.length, length: s.length, draft: p.from, kind, id: p.id, ...more })
			out += s
		}
		const newWords = (): void => add(p.proposal, 'new', { span: old.length })
		if (shape.omit.has(p.id)) { omitted.add(p.id); add(old, 'copy') }
		else if (shape.unwrap.has(p.id) || !wrappable(draft, ops, p.from, p.from + old.length, p.proposal)) {
			if (mode === 'diff' || p.proposal) unmarked.add(p.id)
			newWords()
		} else if (mode === 'diff') {
			wrapped.add(p.id)
			if (old) { add('#gloss-review-del[', 'syntax'); add(old, 'old'); add('];', 'syntax') }
			if (p.proposal) { add('#gloss-review-ins[', 'syntax'); newWords(); add('];', 'syntax') }
		} else if (p.proposal) {
			wrapped.add(p.id)
			add('#gloss-review-new[', 'syntax'); newWords(); add('];', 'syntax')
		} else newWords()
		draftEnd = p.from + old.length
		genEnd = start + out.length
		return out
	})
	copy(text.length, text.length)
	return { text, segments, wrapped, unmarked, omitted }
}

/** The draft with each proposal written as struck old words and underlined new words. */
export const diffSource = (review: DraftReview, draft: string, ops: readonly Op[], shape: Shape): Generated => build(review, draft, ops, shape, 'diff')
/** The applied draft with each proposal's new words highlighted. */
export const newSource = (review: DraftReview, draft: string, ops: readonly Op[], shape: Shape): Generated => build(review, draft, ops, shape, 'new')

/** The draft range a generated range stands for; null when it lies in generated syntax only. */
export function toDraft(g: Generated, from: number, to: number): { from: number; to: number } | null {
	let lo = Infinity, hi = -Infinity
	for (const s of g.segments) {
		if (s.kind === 'syntax') continue
		const a = Math.max(from, s.at), b = Math.min(to, s.at + s.length)
		if (a > b || (a === b && !(from === to && s.length > 0))) continue
		const [x, y] = s.kind === 'new' ? [s.draft, s.draft + s.span!] : [s.draft + a - s.at, s.draft + b - s.at]
		lo = Math.min(lo, x); hi = Math.max(hi, y)
	}
	return lo === Infinity ? null : { from: lo, to: hi }
}

/** The generated offset of a draft offset; inside replaced words, where their new words start. */
export function fromDraft(g: Generated, at: number): number {
	for (const s of g.segments) {
		if (s.kind === 'syntax') continue
		const span = s.kind === 'new' ? s.span! : s.length
		if (at >= s.draft && at < s.draft + span) return s.kind === 'new' ? s.at : s.at + at - s.draft
	}
	return g.text.length
}
