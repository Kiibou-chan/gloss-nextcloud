import type { PanelModel } from './panel-model'

export function ReviewLink({ model, session }: { model: PanelModel; session: { copyReviewLink?(): Promise<void> | void } }) {
  const link = model.link.value
  if (!link) return null
  return <section class="gr-review-link">
    <label for="gr-review-link">Your review link</label>
    <input id="gr-review-link" type="text" readOnly value={link.url} onFocus={event => event.currentTarget.select()} />
    <button type="button" onClick={() => { void session.copyReviewLink?.() }}>Copy</button>
    <p>Open it on any device to continue your review.</p>
    {link.message && <p role="status" aria-live="polite">{link.message}</p>}
  </section>
}
