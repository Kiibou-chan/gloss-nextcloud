import { Conflict } from './conflict'
import { ReviewLink } from './review-link'
import { Overall } from './overall'
import { Card } from './card'
import { CommentForm } from './comment-form'
import type { PanelCommands, PanelModel } from './panel-model'

function Count({ model }: { model: PanelModel }) {
  const { changes, comments } = model.count.value
  return <div id="gr-count" class="gr-count">{changes} {changes === 1 ? 'change' : 'changes'}, {comments} {comments === 1 ? 'comment' : 'comments'}</div>
}
function Cards({ model, session }: { model: PanelModel; session: PanelCommands }) {
  return <ol id="gr-items" class="gr-items">{model.order.value.map(id => {
    const item = model.cards.get(id)
    return item ? <Card key={id} id={id} item={item} session={session} /> : null
  })}</ol>
}
export function Panel({ model, session }: { model: PanelModel; session: PanelCommands }) {
  return <>{model.conflict.value && <Conflict {...model.conflict.value} onShow={() => session.showKeptChanges()} />}<Overall model={model} session={session} /><CommentForm model={model} session={session} /><ReviewLink model={model} session={session} /><Count model={model} /><Cards model={model} session={session} /></>
}
