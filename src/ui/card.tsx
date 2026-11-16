import { ProposalWords } from './proposal-words'
import { Component } from 'preact'
import type { Signal } from '@preact/signals'
import type { CardView } from '../app/view'
import type { PanelCommands } from './panel-model'

type Props = { id: string; item: Signal<CardView>; session: PanelCommands }
/** Signals track this card and skip renders when only its position changes. */
export class Card extends Component<Props> {
  render() {
    const { item, session } = this.props, view = item.value
    const proposal = view.kind === 'proposal'
    return <li data-id={view.id} onClick={() => session.focusItem(view.id)}>
      <div class="gr-card-head">
        {proposal ? <ProposalWords original={view.shown} proposal={view.proposalShown} /> : <blockquote>{view.shown}</blockquote>}
      </div>
      {view.offPdf && <p class="gr-off-pdf">Not shown on the PDF.</p>}
      {view.comments.map((comment, index) => <p class="gr-comment" key={index}>{comment.text}{view.editable && <>{' '}<button type="button" class="gr-small" onClick={event => { event.stopPropagation(); session.deleteComment(view.id, index) }}>Delete</button></>}</p>)}
      {view.editable && <div class="gr-card-actions">
        <button type="button" onClick={event => { event.stopPropagation(); session.openForm({ id: view.id }) }}>{view.comments.length ? 'Add comment' : 'Comment'}</button>
        {proposal && <button type="button" onClick={event => { event.stopPropagation(); session.undoProposal(view.id) }}>Undo change</button>}
      </div>}
    </li>
  }
}
