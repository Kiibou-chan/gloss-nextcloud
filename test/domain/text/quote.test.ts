import { describe, it, expect } from 'vitest';
import { quoteAt, refind, placeItems } from '../../../src/domain/text/quote';

// Synthetic cases ported from gloss test/platform/text/text.test.ts at 8fc93e7eb.
describe('quoteAt', () => {
  it('takes 32 characters of context each side', () => {
    const t = 'p'.repeat(40) + 'EXACT' + 's'.repeat(40);
    expect(quoteAt(t, 40, 45)).toEqual({ exact: 'EXACT', prefix: 'p'.repeat(32), suffix: 's'.repeat(32) });
  });
});

describe('refind', () => {
  const q = (exact: string, prefix = '', suffix = '') => ({ exact, prefix, suffix });
  it('takes the nearest occurrence when no context tells them apart', () => {
    expect(refind('a sum, a sum.', q('a sum'), 6)).toEqual({ start: 7, end: 12, detached: false });
  });
  it('prefers an occurrence whose prefix and suffix match the stored ones over a nearer one', () => {
    const text = 'is a sum here. It is computed as a sum.\n';
    expect(refind(text, q('a sum', 'computed as ', '.\n'), 0)).toEqual({ start: text.lastIndexOf('a sum'), end: text.lastIndexOf('a sum') + 5, detached: false });
  });
  it('among occurrences with equal context takes the nearest', () => {
    const text = 'x as a sum. y as a sum. z as a sum.';
    expect(refind(text, q('a sum', 'as '), 20)).toEqual({ start: 17, end: 22, detached: false });
  });
  it('detaches rather than jump more than 5000 characters to an occurrence with no matching context, keeping it as the best guess', () => {
    const text = 'start. ' + 'x'.repeat(6000) + ' the word ';
    const at = text.indexOf('word');
    expect(refind(text, q('word', 'old ', ' gone'), 3)).toEqual({ start: 3, end: 3, detached: true, bestGuess: { start: at, end: at + 4 } });
  });
  it('guesses a reworded quote between its prefix and suffix when both are still there', () => {
    const before = 'We measure two things. The two measurable effects differ in size. Then we stop.\n';
    const s = before.indexOf('two measurable'), e = s + 'two measurable effects'.length;
    const quote = { exact: before.slice(s, e), prefix: before.slice(Math.max(0, s - 32), s), suffix: before.slice(e, e + 32) };
    const after = before.replace('two measurable effects', 'both observed quantities');
    const at = after.indexOf('both observed');
    expect(refind(after, quote, s)).toEqual({ start: s, end: s, detached: true, bestGuess: { start: at, end: at + 'both observed quantities'.length } });
  });
  it('guesses from the end of the prefix alone when the suffix is gone too, as long as the quote was', () => {
    const quote = { exact: 'old words', prefix: 'The sentence starts with ', suffix: ' and then ends.' };
    const text = 'Intro.\nThe sentence starts with new wording entirely.\n';
    const at = text.indexOf('new wording');
    expect(refind(text, quote, 32).bestGuess).toEqual({ start: at, end: at + 'old words'.length });
  });
  it('guesses from the start of the suffix alone when the prefix is gone', () => {
    const quote = { exact: 'old words', prefix: 'The sentence starts with ', suffix: ' and then it ends.' };
    const text = 'Intro.\nA rewritten opening and then it ends.\n';
    const at = text.indexOf(' and then it ends.');
    expect(refind(text, quote, 32).bestGuess).toEqual({ start: at - 'old words'.length, end: at });
  });
  it('has no best guess when neither the quote nor its context is anywhere near', () => {
    const quote = { exact: 'old words', prefix: 'The sentence starts with ', suffix: ' and then it ends.' };
    expect(refind('Something else altogether.\n', quote, 10)).toEqual({ start: 10, end: 10, detached: true });
  });
  it('jumps more than 5000 characters to an occurrence whose context matches', () => {
    const text = 'start. ' + 'x'.repeat(6000) + ' old word gone';
    const at = text.indexOf('word');
    expect(refind(text, q('word', 'old ', ' gone'), 3)).toEqual({ start: at, end: at + 4, detached: false });
  });
  it('keeps a lost quote at its old start clamped to the text, detached', () => {
    expect(refind('Gone.\n', q('a sum'), 19)).toEqual({ start: 6, end: 6, detached: true });
  });
  it('re-anchors an empty quote by its prefix and suffix, else detaches it at the clamped start', () => {
    expect(refind('New line.\nIt is here.\n', q('', 'It is ', 'here'), 6)).toEqual({ start: 16, end: 16, detached: false });
    expect(refind('Other.\n', q('', 'It is ', 'here'), 60)).toEqual({ start: 7, end: 7, detached: true });
  });
});
describe('placing saved items', () => {
  const comment = { text: 'Please clarify this.', at: '2026-11-15T12:00:00Z' };
  const proposal = (id: string, exact: string, from = 0, comments = [comment]) => ({
    id, kind: 'proposal' as const, file: 'draft.typ', from,
    quote: { exact, prefix: '', suffix: '' }, proposal: 'new words', comments,
    at: '2026-11-15T12:00:00Z', extra: 'preserved',
  });

  it('places words moved 3,000 characters and refreshes the quote without mutating the record', () => {
    const record = proposal('first', 'needle');
    const draft = 'x'.repeat(3000) + 'needle';
    expect(placeItems([record], draft)).toEqual({
      placed: [{ ...record, from: 3000, quote: quoteAt(draft, 3000, 3006) }], lost: 0,
    });
    expect(record.from).toBe(0);
    expect(record.quote.prefix).toBe('');
  });

  it('chooses the nearer of equal occurrences', () => {
    const record = proposal('first', 'word', 9);
    expect(placeItems([record], 'word ... word').placed[0]?.from).toBe(9);
  });

  it('counts missing words as lost even when a context guess exists', () => {
    const record = { ...proposal('first', 'old'), quote: { exact: 'old', prefix: 'before ', suffix: ' after' } };
    expect(placeItems([record], 'before new after')).toEqual({ placed: [], lost: 1 });
  });

  it('does not place an insertion whose contexts no longer meet at its old offset', () => {
    const record = { ...proposal('first', '', 7), quote: { exact: '', prefix: 'before ', suffix: 'after' } };
    expect(placeItems([record], 'before changed after')).toEqual({ placed: [], lost: 1 });
  });

  it.each([
    ['overlapping words', 'alpha beta', 'beta gamma', 'alpha beta gamma'],
    ['same occurrence', 'alpha', 'alpha', 'alpha'],
    ['same insertion', '', '', 'alpha'],
    ['insertion at start', 'alpha', '', 'alpha'],
  ])('keeps the first proposal in saved order: %s', (_label, first, second, draft) => {
    const a = proposal('first', first);
    const b = proposal('second', second);
    // Empty quotes need surviving context to be attached.
    if (!first) a.quote.suffix = draft;
    if (!second) b.quote.suffix = draft;
    expect(placeItems([a, b], draft)).toEqual({
      placed: [
        { ...a, quote: quoteAt(draft, 0, first.length) },
      ], lost: 1,
    });
  });

  it.each([0, 2, 5])('handles an insertion at offset %i of a placed range', at => {
    const a = proposal('first', 'alpha');
    const b = { ...proposal('second', '', at), quote: quoteAt('alpha', at, at) };
    const result = placeItems([a, b], 'alpha');
    expect(result.lost).toBe(at === 5 ? 0 : 1);
    expect(result.placed.map(item => item.id)).toEqual(at === 5 ? ['first', 'second'] : ['first']);
  });

  it('also detects a range overlapping an earlier insertion', () => {
    const insertion = { ...proposal('first', '', 2), quote: quoteAt('alpha', 2, 2) };
    expect(placeItems([insertion, proposal('second', 'alpha')], 'alpha').lost).toBe(1);
  });

  it('leaves an overlapping proposal without comments unplaced and retains touching ranges', () => {
    const a = proposal('first', 'alpha');
    const b = proposal('second', 'alpha', 0, []);
    const c = proposal('third', 'beta', 5);
    expect(placeItems([a, b, c], 'alphabeta')).toEqual({ placed: [
      { ...a, quote: quoteAt('alphabeta', 0, 5) },
      { ...c, quote: quoteAt('alphabeta', 5, 9) },
    ], lost: 1 });
  });

  it('passes overall items through and allows comment anchors to overlap proposals', () => {
    const overall = { id: 'overall', kind: 'overall' as const, text: 'A synthetic summary.', at: comment.at };
    const { proposal: _removed, ...rest } = proposal('note', 'alpha');
    const note = { ...rest, kind: 'comment' as const };
    const change = proposal('first', 'alpha');
    expect(placeItems([overall, note, change], 'alpha')).toEqual({ placed: [
      overall, { ...note, quote: quoteAt('alpha', 0, 5) }, { ...change, quote: quoteAt('alpha', 0, 5) },
    ], lost: 0 });
  });
});

it('takes context at text boundaries and counts UTF-16 units', () => {
  expect(quoteAt('𝒜 beta', 0, 2)).toEqual({ exact: '𝒜', prefix: '', suffix: ' beta' });
  expect(quoteAt('𝒜 beta', 3, 7)).toEqual({ exact: 'beta', prefix: '𝒜 ', suffix: '' });
});

it('detaches an empty quote with no context', () => {
  expect(refind('alpha', { exact: '', prefix: '', suffix: '' }, 2)).toEqual({ start: 2, end: 2, detached: true });
});
