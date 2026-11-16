import type { Op } from '../source/typst-parse';

type Key<Place> = { key: string; at: Place[] };
export type SourceKey = Key<number> & { file: string; text: string };
type PdfPoint = { page: number; item: number; offset: number; endOffset: number };
export type PdfKey = Key<PdfPoint>;

/** NFKC splits ligatures; only lower-case letters and digits participate. */
export function keyOf<Place>(chars: Iterable<readonly [string, Place]>): Key<Place> {
  let key = '';
  const at: Place[] = [];
  for (const [ch, place] of chars) {
    for (const k of ch.normalize('NFKC').toLowerCase()) {
      if (/[\p{L}\p{N}]/u.test(k)) {
        key += k;
        // String search returns UTF-16 indexes, including both units of a surrogate pair.
        for (let unit = 0; unit < k.length; unit++) at.push(place);
      }
    }
  }
  return { key, at };
}

export function sourceKey(file: string, text: string, ops: readonly Op[]): SourceKey {
  const chars = function* (): Generator<readonly [string, number]> {
    for (const op of ops) {
      if (op.op === 'text') {
        for (let i = op.from; i < op.to;) {
          const ch = String.fromCodePoint(text.codePointAt(i)!);
          yield [ch, i];
          i += ch.length;
        }
      }
    }
  };
  return { file, text, ...keyOf(chars()) };
}

/** Page numbers are one-based, item indexes and UTF-16 offsets zero-based. */
export function pdfKey(pages: readonly (readonly string[])[]): PdfKey {
  const chars = function* (): Generator<readonly [string, PdfPoint]> {
    for (let page = 0; page < pages.length; page++) {
      const items = pages[page]!;
      for (let item = 0; item < items.length; item++) {
        const text = items[item]!;
        for (let offset = 0; offset < text.length;) {
          const ch = String.fromCodePoint(text.codePointAt(offset)!);
          yield [ch, { page: page + 1, item, offset, endOffset: offset + ch.length }];
          offset += ch.length;
        }
      }
    }
  };
  return keyOf(chars());
}

const WINDOW = 2000;

/** Keep the first occurrence on a tie, as in the spike. The needle is already a key.
 * Hits starting within WINDOW of the fraction's position are searched first; the whole key is searched only when none is strictly closer than WINDOW.
 */
export function nearestKey(key: string, needle: string, fraction: number): { start: number; end: number } | null {
  if (!needle) return null;
  const centre = fraction * key.length;
  const from = Math.max(0, Math.floor(centre - WINDOW));
  const to = centre + WINDOW + needle.length;
  const bestIn = (haystack: string, offset: number, limit: number): number => {
    let best = -1;
    for (let at = haystack.indexOf(needle); at >= 0 && at + offset < limit; at = haystack.indexOf(needle, at + 1)) {
      const hit = at + offset;
      if (best < 0 || Math.abs(hit / key.length - fraction) < Math.abs(best / key.length - fraction)) best = hit;
    }
    return best;
  };
  const near = bestIn(key.slice(from, Math.ceil(to) + needle.length - 1), from, to);
  if (near >= 0 && Math.abs(near / key.length - fraction) * key.length < WINDOW - 1e-6) {
    return { start: near, end: near + needle.length };
  }
  const best = bestIn(key, 0, Infinity);
  return best < 0 ? null : { start: best, end: best + needle.length };
}

function nearest(key: string, selected: string, fraction: number): { start: number; end: number } | null {
  return nearestKey(key, keyOf([...selected].map(c => [c, 0] as const)).key, fraction);
}

export function toSource(sk: SourceKey, selected: string, fraction: number): { file: string; from: number; to: number } | null {
  const hit = nearest(sk.key, selected, fraction);
  if (!hit) return null;
  const last = sk.at[hit.end - 1]!;
  const width = String.fromCodePoint(sk.text.codePointAt(last)!).length;
  return { file: sk.file, from: sk.at[hit.start]!, to: last + width };
}

export type PdfPlacement = {
  id: string;
  page: number;
  startItem: number;
  startOffset: number;
  endItem: number;
  endOffset: number;
};

/** One placement per page for the key range [start, end).
 * Cross-page matches produce one segment per page, with the same id.
 * Item indexes are page-local; endOffset is exclusive in UTF-16 units.
 */
export function segments(pk: PdfKey, id: string, start: number, end: number): PdfPlacement[] {
  const placements: PdfPlacement[] = [];
  let from = pk.at[start]!;
  let to = from;
  const emit = () => placements.push({
    id, page: from.page, startItem: from.item, startOffset: from.offset,
    endItem: to.item, endOffset: to.endOffset,
  });
  for (let i = start + 1; i < end; i++) {
    const point = pk.at[i]!;
    if (point.page !== from.page) { emit(); from = point; }
    to = point;
  }
  emit();
  return placements;
}

export function placeMarks(pk: PdfKey, items: readonly { id: string; shown: string; fraction: number }[]): PdfPlacement[] {
  const placements: PdfPlacement[] = [];
  for (const item of items) {
    const hit = nearest(pk.key, item.shown, item.fraction);
    if (hit) placements.push(...segments(pk, item.id, hit.start, hit.end));
  }
  return placements;
}
