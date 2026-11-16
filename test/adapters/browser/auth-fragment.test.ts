import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { restoreAuthFragment } from '../../../src/adapters/browser/auth-fragment'

const prefix = 'gloss-auth-fragment:'
const scope = 'synthetic-digest'
afterEach(() => { sessionStorage.clear(); history.replaceState(null, '', '/'); vi.restoreAllMocks() })
it('the password form stashes only the fragment on submit, including after a wrong password', () => {
  const template = readFileSync('templates/authenticate.php', 'utf8').replace(/<\?php[\s\S]*?\?>/g, '')
  const script = template.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1]
  expect(script).toBeTruthy()
  document.body.innerHTML = `<form data-fragment-scope="${scope}"></form>`
  history.replaceState(null, '', '/r/synthetic#SavedReviewKey123')
  new Function('document', 'location', 'sessionStorage', script!)(document, location, sessionStorage)
  document.querySelector('form')!.dispatchEvent(new Event('submit'))
  expect(sessionStorage.getItem(prefix + scope)).toBe('#SavedReviewKey123')
  history.replaceState(null, '', '/r/synthetic/authenticate')
  document.querySelector('form')!.dispatchEvent(new Event('submit'))
  expect(sessionStorage.getItem(prefix + scope)).toBe('#SavedReviewKey123')
})
it('restores the same token fragment before the review reads it and consumes the stash', () => {
  sessionStorage.setItem(prefix + scope, '#SavedReviewKey123')
  history.replaceState({ retained: true }, '', '/r/synthetic/view?test=1')
  restoreAuthFragment(scope)
  expect(location.href).toContain('/r/synthetic/view?test=1#SavedReviewKey123')
  expect(history.state).toEqual({ retained: true })
  expect(sessionStorage.length).toBe(0)
})
it('keeps an explicit fragment and clears the stash', () => {
  sessionStorage.setItem(prefix + scope, '#OldReviewKey12345')
  history.replaceState(null, '', '/r/synthetic/view#ExplicitReview123')
  restoreAuthFragment(scope)
  expect(location.hash).toBe('#ExplicitReview123')
  expect(sessionStorage.length).toBe(0)
})
it('discards a stash for another token', () => {
  sessionStorage.setItem(prefix + 'other-digest', '#OtherReviewKey123')
  restoreAuthFragment(scope)
  expect(location.hash).toBe('')
  expect(sessionStorage.length).toBe(0)
})
it('tolerates unavailable storage', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('unavailable') })
  expect(() => restoreAuthFragment(scope)).not.toThrow()
})
