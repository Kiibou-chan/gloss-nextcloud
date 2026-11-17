import { Unplaced } from './unplaced'
import { Conflict } from './conflict'
import { ReviewLink } from './review-link'
import { Overall } from './overall'
import { Card } from './card'
import { CommentForm } from './comment-form'
import type { PanelCommands, PanelModel } from './panel-model'

export function Count({ model, id = 'gr-count' }: { model: PanelModel; id?: string }) {
  const { changes, comments } = model.count.value
  return <div id={id || undefined} class="gr-count">{changes} {changes === 1 ? 'change' : 'changes'}, {comments} {comments === 1 ? 'comment' : 'comments'}</div>
}
export function Cards({ model, session, id = 'gr-items' }: { model: PanelModel; session: PanelCommands; id?: string }) {
  return <ol id={id || undefined} class="gr-items">{model.order.value.map(id => {
    const item = model.cards.get(id)
    return item ? <Card key={id} id={id} item={item} session={session} /> : null
  })}</ol>
}
export function Panel({ model, session }: { model: PanelModel; session: PanelCommands }) {
  return <>{model.conflict.value && <Conflict {...model.conflict.value} onShow={() => session.showKeptChanges()} />}<Overall model={model} /><CommentForm model={model} session={session} /><ReviewLink model={model} session={session} /><Unplaced model={model} /><Count model={model} /><Cards model={model} session={session} /></>
}
