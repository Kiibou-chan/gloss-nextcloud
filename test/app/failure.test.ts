import { expect, test } from 'vitest'
import { classify, refusal, restoreRefusal } from '../../src/app/failure'

test.each([0, 423, 500, 503])('retries %i', status => {
  expect(classify({status, error: 'failure'})).toBe('retry')
})
test.each([403, 404, 410])('blocks a gone link %i without mutating the failure', status => {
  const failure = Object.freeze({status, error: 'gone'})
  expect(classify(failure)).toBe('linkGone')
  expect(refusal(failure, 'Not saved: ').blocks).toBe(true)
})
test('distinguishes session expiry and final refusals', () => {
  expect(classify({status: 412, error: 'expired'})).toBe('session')
  expect(classify({status: 429, error: 'limited'})).toBe('final')
  expect(refusal({status: 400, error: 'bad'}, 'Not saved: ')).toEqual({text: 'Not saved: bad', blocks: false})
})

// Live failures stop, but only these refusals survive a reload today.
test.each([400, 403, 404, 409, 410, 413])('retains stored refusal %i', status => {
  const failure = { status, error: 'refused' }
  expect(restoreRefusal(failure)).toBe(failure)
})
test.each([0, 412, 422, 423, 429, 500])('drops stored refusal %i', status => {
  expect(restoreRefusal({ status, error: 'refused' })).toBeNull()
})
