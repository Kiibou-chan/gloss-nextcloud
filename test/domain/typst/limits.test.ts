import { expect, test } from 'vitest'
import { MAX_DRAFT_LINES, MAX_PROPOSALS, tooLargeToCompile } from '../../../src/domain/typst/limits'

const lines = (n: number) => Array.from({ length: n }, () => 'x').join('\n')

test('the cutoff is 2,000 lines or 400 proposals', () => {
  expect(MAX_DRAFT_LINES).toBe(2000)
  expect(MAX_PROPOSALS).toBe(400)
})

test('a draft of 2,000 lines compiles and one of 2,001 does not', () => {
  expect(tooLargeToCompile(lines(2000), 0)).toBe(false)
  expect(tooLargeToCompile(lines(2000) + '\n', 0)).toBe(false)
  expect(tooLargeToCompile(lines(2001), 0)).toBe(true)
})

test('400 proposals compile and 401 do not', () => {
  expect(tooLargeToCompile('a', 400)).toBe(false)
  expect(tooLargeToCompile('a', 401)).toBe(true)
})
