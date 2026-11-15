import { signal } from '@preact/signals'
import type { Signal } from '@preact/signals'
import type { PanelPort } from '../app/ports'
import type { ReviewSession } from '../app/session'
import type { CardView, HeadView } from '../app/view'
import { flushIslands } from './island'

/** Only the public session commands are available to the islands and their fakes. */
export type PanelCommands = Pick<ReviewSession, 'setName' | 'setView' | 'openForm' | 'cancelForm' | 'commentOn' | 'deleteComment' | 'undoProposal' | 'focusItem' | 'send' | 'setOverall' | 'showKeptChanges'>
export interface PanelModel extends PanelPort {
  readonly cards: Map<string, Signal<CardView>>
  readonly order: Signal<readonly string[]>
  readonly count: Signal<{ changes: number; comments: number }>
  readonly head: Signal<HeadView>
}

export function createPanelModel(): PanelModel {
  const cards = new Map<string, Signal<CardView>>()
  const order = signal<readonly string[]>([])
  const count = signal({ changes: 0, comments: 0 })
  const head = signal<HeadView>({ name: '', title: '', hasPdf: false, view: 'editor', editable: false, canSend: false, status: '', countText: '0 changes, 0 comments', form: null })
  return {
    cards, order, count, head,
    upsertCard(view) {
      const existing = cards.get(view.id)
      if (existing) existing.value = view
      else cards.set(view.id, signal(view))
      flushIslands()
    },
    removeCard(id) { cards.delete(id); flushIslands() },
    setOrder(ids) { order.value = [...ids]; flushIslands() },
    setCount(value) { count.value = { ...value }; flushIslands() },
    setHead(view) { head.value = view; flushIslands() },
  }
}
