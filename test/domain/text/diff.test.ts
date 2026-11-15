import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { changes, tokens, type DiffChange } from '../../../src/domain/text/diff'

describe('word diff', () => {
  test.each(['', 'alpha beta', 'Grüsse für αλφα'])('equal strings: %s', text => {
    expect(changes(text, text)).toEqual([])
  })

  test.each([
    ['alpha beta', 'new alpha beta', 0, 0, 0, 4],
    ['alpha beta', 'alpha new beta', 6, 6, 6, 10],
    ['alpha beta', 'alpha beta new', 10, 10, 10, 14],
    ['new alpha beta', 'alpha beta', 0, 4, 0, 0],
    ['alpha new beta', 'alpha beta', 6, 10, 6, 6],
    ['alpha beta new', 'alpha beta', 10, 14, 10, 10],
    ['alpha beta gamma', 'new beta gamma', 0, 5, 0, 3],
    ['alpha beta gamma', 'alpha new gamma', 6, 10, 6, 9],
    ['alpha beta gamma', 'alpha beta new', 11, 16, 11, 14],
  ] as const)('ranges for %s -> %s', (a, b, aFrom, aTo, bFrom, bTo) => {
    expect(changes(a, b)).toEqual([{ aFrom, aTo, bFrom, bTo }])
  })

  test('joins changes separated by one whitespace token', () => {
    expect(changes('alpha beta', 'gamma delta')).toEqual([
      { aFrom: 0, aTo: 10, bFrom: 0, bTo: 11 },
    ])
  })

  test('keeps changes separated by an unchanged word distinct', () => {
    expect(changes('alpha beta gamma', 'delta beta epsilon')).toEqual([
      { aFrom: 0, aTo: 5, bFrom: 0, bTo: 5 },
      { aFrom: 11, aTo: 16, bFrom: 11, bTo: 18 },
    ])
  })

  test('tokenises Unicode letters and numbers with UTF-16 offsets', () => {
    expect(tokens('αλφα Grüße 中文 𝒜12!', 'word')).toEqual([
      { t: 'αλφα', at: 0 }, { t: ' ', at: 4 }, { t: 'Grüße', at: 5 },
      { t: ' ', at: 10 }, { t: '中文', at: 11 }, { t: ' ', at: 13 },
      { t: '𝒜12', at: 14 }, { t: '!', at: 18 },
    ])
  })

  test('caps token insertions and deletions, including the exact boundary', () => {
    expect(changes('a keep b keep c keep d keep e keep f', 'A keep B keep C keep D keep E keep F', { maxEdits: 5 })).toBe('tooMany')
    expect(changes('', 'a b c', { maxEdits: 5 })).toEqual([
      { aFrom: 0, aTo: 0, bFrom: 0, bTo: 5 },
    ])
    expect(changes('a', 'b', { maxEdits: 1 })).toBe('tooMany')
    expect(changes('a', 'a', { maxEdits: 0 })).toEqual([])
    expect(changes('a', 'b', { maxEdits: 0 })).toBe('tooMany')
  })

  test('stops a 3,000-word replacement at 2,000 edits', () => {
    expect(changes('alpha '.repeat(3000), 'beta '.repeat(3000), { maxEdits: 2000 })).toBe('tooMany')
    expect(changes('alpha '.repeat(3000), 'beta '.repeat(3000))).toBe('tooMany')
  })

  test('honours an explicit 5,000 cap for 3,000 separated edits', () => {
    const a = 'keep '.repeat(3000)
    const b = '!keep '.repeat(3000)
    const result = changes(a, b, { maxEdits: 5000 })
    expect(result).not.toBe('tooMany')
    if (result === 'tooMany') throw new Error('Expected exact changes')
    expect(result).toHaveLength(3000)
    expect(result.reduceRight((text, c) => text.slice(0, c.aFrom) + b.slice(c.bFrom, c.bTo) + text.slice(c.aTo), a)).toBe(b)
  })

  test('trims a long common prefix and suffix without shifting offsets', () => {
    const prefix = 'alpha beta\n'.repeat(5000)
    const suffix = '\ngamma delta'.repeat(5000)
    expect(changes(prefix + 'old' + suffix, prefix + 'new' + suffix, { maxEdits: 2 })).toEqual([
      { aFrom: prefix.length, aTo: prefix.length + 3, bFrom: prefix.length, bTo: prefix.length + 3 },
    ])
  })

  const golden = JSON.parse(readFileSync(new URL('../../fixtures/spike/diff.json', import.meta.url), 'utf8')) as {
    cases: { input: { a: string; b: string }; expected: DiffChange[] }[]
  }
  test.each(golden.cases)('matches the spike: $input.a -> $input.b', ({ input, expected }) => {
    expect(changes(input.a, input.b)).toEqual(expected)
  })
})

describe('line diff', () => {
  test('keeps line endings and an unterminated final line', () => {
    expect(tokens('alpha\r\n\nbeta', 'line')).toEqual([
      { t: 'alpha\r\n', at: 0 }, { t: '\n', at: 7 }, { t: 'beta', at: 8 },
    ])
    expect(tokens('', 'line')).toEqual([])
  })

  test('returns each changed run of whole lines', () => {
    expect(changes('alpha\nbeta\ngamma\ndelta\n', 'ALPHA\nBETA\ngamma\nDELTA\n', { by: 'line' })).toEqual([
      { aFrom: 0, aTo: 11, bFrom: 0, bTo: 11 },
      { aFrom: 17, aTo: 23, bFrom: 17, bTo: 23 },
    ])
  })

  test('does not join runs across an unchanged blank line', () => {
    expect(changes('alpha\n\nbeta', 'ALPHA\n\nBETA', { by: 'line' })).toEqual([
      { aFrom: 0, aTo: 6, bFrom: 0, bTo: 6 },
      { aFrom: 7, aTo: 11, bFrom: 7, bTo: 11 },
    ])
  })
})
