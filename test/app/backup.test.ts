import { expect, test } from 'vitest'
import { readBackup } from '../../src/app/backup'
import { fakes } from './fakes'

test('invalid browser backup cannot supply a record', () => {
  const f = fakes()
  expect(readBackup('{', f.ids)).toBeNull()
  expect(readBackup('{}', f.ids)).toHaveProperty('error')
})
