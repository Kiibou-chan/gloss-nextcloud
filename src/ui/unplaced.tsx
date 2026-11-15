import type { PanelModel } from './panel-model'

export function Unplaced({ model }: { model: PanelModel }) {
  const items = model.unplaced.value
  if (!items.length) return null
  return <section class="gr-unplaced" aria-label="Could not place"><h2>Could not place</h2><ol>{items.map(item =>
    <li key={item.id}><blockquote>{item.quote}</blockquote>{item.comments.map((comment, i) => <p key={i}>{comment.text}</p>)}</li>,
  )}</ol></section>
}
