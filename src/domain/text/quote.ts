import type { Item, Proposal, Quote } from '../review/model'
/** Ported from gloss src/platform/text/logic/text.ts at 8fc93e7eb.
 * R9 differences: an empty quote without joined context is detached;
 * placeItems rejects overlapping proposals in saved order, retaining their comments.
 */
export type { Quote } from '../review/model'

const MAX_DISTANCE = 5000;

/** The start of the occurrence of s in text nearest near; -1 when s does not occur. */
function nearest(text: string, s: string, near: number): number {
  let best = -1, bestDist = Infinity;
  for (let i = text.indexOf(s); i >= 0; i = text.indexOf(s, i + 1)) {
    const d = Math.abs(i - near);
    if (d < bestDist) { best = i; bestDist = d; }
  }
  return best;
}

/** The nearest non-empty occurrence within the shared context distance, or -1. */
function nearestWithin(text: string, s: string, at: number): number {
  const found = s ? nearest(text, s, at) : -1;
  return found >= 0 && Math.abs(found - at) <= MAX_DISTANCE ? found : -1;
}

/** The shortest stored context that still places a lost quote: a stored prefix or suffix is tried whole, then its 16
 * characters next to the quote. */
const CONTEXT_MIN = 16;

/** Where a lost quote most likely went (MODEL-1, Brush et al. 2001): the stretch between the nearest remaining prefix
 * and suffix, or the quote's length after the prefix or before the suffix when only one of them is left; each looked
 * for within 5000 characters of the old start. Undefined when neither is. */
function contextGuess(text: string, q: Quote, start: number): { start: number; end: number } | undefined {
  const find = (whole: string, part: string, at: number, tail: boolean): { at: number; len: number } | undefined => {
    for (const s of whole.length > CONTEXT_MIN ? [whole, part] : [whole]) {
      if (!s.trim()) continue;
      const i = nearestWithin(text, s, tail ? at - s.length : at);
      if (i >= 0) return { at: i, len: s.length };
    }
    return undefined;
  };
  const p = find(q.prefix, q.prefix.slice(-CONTEXT_MIN), start, true);
  const pEnd = p ? p.at + p.len : -1;
  const s = find(q.suffix, q.suffix.slice(0, CONTEXT_MIN), pEnd >= 0 ? pEnd : start + q.exact.length, false);
  const len = q.exact.length;
  if (p && s && s.at >= pEnd && s.at - pEnd <= Math.max(2 * len, len + 200)) return { start: pEnd, end: s.at };
  if (p) return { start: pEnd, end: Math.min(pEnd + len, text.length) };
  if (s) return { start: Math.max(0, s.at - len), end: s.at };
  return undefined;
}

/** An anchor's place in text after an outside change (spec 5.2 rule 2). Of the occurrences of the quote, those whose
 * stored prefix and suffix match more count first, then the nearest to the old start; one more than 5000 characters
 * away with neither matching is no match. No match: the old start clamped to the text, detached, with the best guess
 * below the threshold when there is one (that far occurrence, else the place its context gives). An empty quote goes
 * where its prefix and suffix meet, else detaches at the clamped start. */
export function refind(text: string, q: Quote, start: number, window?: { from: number; to: number }, guess = true): { start: number; end: number; detached: boolean; bestGuess?: { start: number; end: number } } {
  const clamped = Math.min(Math.max(start, 0), text.length);
  if (!q.exact) {
    const ctx = q.prefix + q.suffix, at = ctx ? nearest(text, ctx, clamped - q.prefix.length) : -1;
    const p = at >= 0 ? at + q.prefix.length : clamped;
    return { start: p, end: p, detached: at < 0 };
  }
  const full = (q.prefix ? 1 : 0) + (q.suffix ? 1 : 0);
  const scoreAt = (i: number) => (q.prefix && i >= q.prefix.length && text.startsWith(q.prefix, i - q.prefix.length) ? 1 : 0)
    + (q.suffix && text.startsWith(q.suffix, i + q.exact.length) ? 1 : 0);
  if (start >= (window?.from ?? 0) && start + q.exact.length <= (window?.to ?? text.length) && text.startsWith(q.exact, start) && scoreAt(start) === full) return { start, end: start + q.exact.length, detached: false };
  let best = -1, bestScore = -1, bestDist = Infinity;
  /** Scores the occurrences starting in [from, to], searched in that stretch of the text only. */
  const scan = (from: number, to: number) => {
    from = Math.max(from, window?.from ?? 0);
    to = Math.min(to, (window?.to ?? text.length) - q.exact.length);
    if (to < from) return;
    const w = from === 0 && to >= text.length ? text : text.slice(from, to + q.exact.length);
    for (let j = w.indexOf(q.exact); j >= 0; j = w.indexOf(q.exact, j + 1)) {
      const i = from + j, score = scoreAt(i), d = Math.abs(i - start);
      if (score > bestScore || (score === bestScore && d < bestDist)) { best = i; bestScore = score; bestDist = d; }
    }
  };
  // A full match within MAX_DISTANCE beats every occurrence further away, so the whole text is scanned only without one.
  scan(Math.max(0, start - MAX_DISTANCE), Math.max(0, start + MAX_DISTANCE));
  if (bestScore < full) { best = -1; bestScore = -1; bestDist = Infinity; scan(0, text.length); }
  if (best >= 0 && !(bestScore === 0 && bestDist > MAX_DISTANCE)) return { start: best, end: best + q.exact.length, detached: false };
  const outside = guess && window && (window.from > 0 || window.to < text.length) ? refind(text, q, start) : undefined;
  const bestGuess = !guess ? undefined : outside ? (outside.detached ? outside.bestGuess : { start: outside.start, end: outside.end })
    : best >= 0 ? { start: best, end: best + q.exact.length } : contextGuess(text, q, start);
  return { start: clamped, end: clamped, detached: true, ...(bestGuess ? { bestGuess } : {}) };
}

export function quoteAt(text: string, start: number, end: number): Quote {
  return { exact: text.slice(start, end), prefix: text.slice(Math.max(0, start - 32), start), suffix: text.slice(end, end + 32) };
}


type Placed<T> = T extends Proposal
  ? T | (Omit<T, 'kind' | 'proposal'> & { kind: 'comment' }) : T;

/** Half-open ranges, with an insertion conflicting at the start or inside a range.
 * Two insertions at the same point also conflict.
 */
function overlaps(a: number, aEnd: number, b: number, bEnd: number): boolean {
  if (a === aEnd && b === bEnd) return a === b;
  return a < Math.max(bEnd, b + 1) && b < Math.max(aEnd, a + 1);
}

/** Place in saved order, preserving metadata and leaving the saved input untouched. */
export function placeItems<T extends Item>(records: readonly T[], draft: string): { placed: Placed<T>[]; lost: number } {
  const placed: Item[] = [];
  const proposals: { start: number; end: number }[] = [];
  let lost = 0;
  for (const record of records) {
    if (record.kind === 'overall') {
      placed.push(record);
      continue;
    }
    const range = refind(draft, record.quote, record.from);
    if (range.detached) {
      lost++;
      continue;
    }
    const refreshed = { ...record, from: range.start, quote: quoteAt(draft, range.start, range.end) };
    if (record.kind === 'proposal') {
      if (proposals.some(prior => overlaps(prior.start, prior.end, range.start, range.end))) {
        lost++;
        if (record.comments.length) {
          const { proposal: _proposal, ...comment } = refreshed as Proposal;
          placed.push({ ...comment, kind: 'comment' });
        }
        continue;
      }
      proposals.push(range);
    }
    placed.push(refreshed);
  }
  // Each output is its original T with refreshed anchoring, or the specified comment conversion.
  return { placed: placed as Placed<T>[], lost };
}
