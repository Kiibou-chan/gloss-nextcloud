import { expect, test } from 'vitest'
import { proposalLabel } from '../../src/app/brief'

test('the label is the new words, a line break, or nothing', () => {
  expect(proposalLabel('old', '  new\n words ')).toBe('new words')
  expect(proposalLabel(',', ';')).toBe(';')
  expect(proposalLabel('', ' \n ')).toBe('(line break)')
  expect(proposalLabel(' ', '')).toBe('(line break)')
  expect(proposalLabel('old', '')).toBeNull()
})
