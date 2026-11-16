import { nearestKey, segments } from './match';
import type { PdfKey, PdfPlacement, SourceKey } from './match';

/** `offset` is the UTF-16 offset of the character the caret sits beside, in its text item. */
export type PdfCaret = { id: string; page: number; item: number; offset: number; edge: 'after' | 'before' };
type Rung = 'both' | 'before' | 'after' | 'alone';
export type ItemPlace = { struck: PdfPlacement[]; caret: PdfCaret | null; rung: Rung };

const CONTEXT = 24;

/** First index in `at` (sorted, non-decreasing) holding a value of at least `offset`. */
function lower(at: readonly number[], offset: number): number {
  let lo = 0;
  let hi = at.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (at[mid]! < offset) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The item's words are the source-key slice for [from, to); the ladder widens the needle's context until it finds a hit. */
export function placeItem(
  sk: SourceKey,
  pk: PdfKey,
  item: { id: string; from: number; to: number; inserts: boolean },
  fraction: number,
): ItemPlace | null {
  const lo = lower(sk.at, item.from);
  const hi = lower(sk.at, item.to);
  const words = sk.key.slice(lo, hi);
  if (!words && /[\p{L}\p{N}]/u.test(sk.text.slice(item.from, item.to))) return null;
  const before = sk.key.slice(Math.max(0, lo - CONTEXT), lo);
  const after = sk.key.slice(hi, hi + CONTEXT);
  const ladder: [Rung, string, string][] = [
    ['both', before, after],
    ['before', before, ''],
    ['after', '', after],
  ];
  if (words) ladder.push(['alone', '', '']);
  for (const [rung, pre, post] of ladder) {
    const hit = nearestKey(pk.key, pre + words + post, fraction);
    if (!hit) continue;
    const start = hit.start + pre.length;
    const end = start + words.length;
    const struck = words ? segments(pk, item.id, start, end) : [];
    if (!item.inserts) return { struck, caret: null, rung };
    const at = words ? end - 1 : pre ? start - 1 : start;
    const point = pk.at[at];
    if (!point) return { struck, caret: null, rung };
    const edge = words || pre ? 'after' : 'before';
    return { struck, caret: { id: item.id, page: point.page, item: point.item, offset: point.offset, edge }, rung };
  }
  return null;
}
