import type { DraftReview } from '../domain/review/draft-review'
import type { Target } from '../domain/review/model'

export function editorTarget(review: DraftReview, range: { from: number; to: number }): Target {
  const a = review.fromApplied(range.from), b = review.fromApplied(range.to)
  return 'inside' in a ? { id: a.inside } : 'inside' in b ? { id: b.inside } : review.targetFor(a.at, b.at)
}
