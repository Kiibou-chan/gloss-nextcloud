import { ProposalWords } from './proposal-words'
import type { PanelModel } from './panel-model'

export function Unplaced({ model }: { model: PanelModel }) {
  const items = model.unplaced.value
  if (!items.length) return null
  return <section class="gr-unplaced" aria-label="Could not place"><h2>Could not place</h2><p>{items.length} of your earlier items could not be placed; they stay in your review file.</p><ol>{items.map(item =>
    <li key={item.id}>{item.proposal === undefined ? <blockquote>{item.quote}</blockquote> : <ProposalWords original={item.quote} proposal={item.proposal} />}{item.comments.map((comment, i) => <p key={i}>{comment.text}</p>)}</li>,
  )}</ol></section>
}
