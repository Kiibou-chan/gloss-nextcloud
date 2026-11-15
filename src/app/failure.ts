import type { Failure } from './ports'

export function classify(failure: Failure): 'retry' | 'final' | 'linkGone' | 'session' {
  if (failure.status === 0 || failure.status === 423 || failure.status >= 500) return 'retry'
  if ([403, 404, 410].includes(failure.status)) return 'linkGone'
  return failure.status === 412 ? 'session' : 'final'
}

export function refusal(failure: Failure, prefix: string): { text: string; blocks: boolean } {
  const blocks = classify(failure) === 'linkGone'
  if (failure.status === 403) return { text: 'This link is not set up for reviewing.', blocks }
  if (failure.status === 404 || failure.status === 410) return { text: 'This review link no longer works. Your changes are kept in this browser.', blocks }
  if (failure.status === 429) return { text: 'The server is refusing saves for now. Your changes are kept in this browser; reload the page later to try again.', blocks }
  if (failure.status === 413) return { text: 'Your review is over 1 MB and cannot be saved; shorten some comments.', blocks }
  if (failure.status === 409) {
    if (failure.error === 'conflict') return { text: 'Your review was changed in another window or on another device. Reload the page to continue.', blocks }
    if (failure.error === 'sent') return { text: 'This review has already been sent.', blocks }
    if (failure.error === 'full') return { text: 'This link has reached its limit of 50 reviews. Please write to the person who sent you the link.', blocks }
    if (failure.error === 'reviewsBlocked') return { text: 'The reviews folder is blocked by a file. Please write to the person who sent you the link.', blocks }
  }
  return { text: prefix + failure.error, blocks }
}
