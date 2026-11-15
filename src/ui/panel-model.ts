import { signal } from '@preact/signals'
import type { Signal } from '@preact/signals'
import type { PanelPort, ReviewLinkView } from '../app/ports'
import type { ReviewSession } from '../app/session'
import type { CardView, HeadView } from '../app/view'
import { flushIslands } from './island'

/** Only the public session commands are available to the islands and their fakes. */
export type PanelCommands = Pick<ReviewSession, 'setName' | 'setView' | 'openForm' | 'cancelForm' | 'commentOn' | 'deleteComment' | 'undoProposal' | 'focusItem' | 'send' | 'setOverall' | 'showKeptChanges'> & Pick<ReviewSession, 'copyReviewLink'> & Partial<Pick<ReviewSession, 'requestName' | 'commentSelection'>>
export interface PanelModel extends PanelPort {
  readonly commentDraft: Signal<string>
  readonly overall: Signal<string>
  readonly link: Signal<ReviewLinkView | null>
  setLink(view: ReviewLinkView | null): void
  readonly cards: Map<string, Signal<CardView>>
  readonly order: Signal<readonly string[]>
  readonly count: Signal<{ changes: number; comments: number }>
  readonly conflict: Signal<{ text: string; show: boolean } | null>
  readonly head: Signal<HeadView>
}

export function createPanelModel(): PanelModel {
  const link = signal<ReviewLinkView | null>(null)
  const overall = signal('')
  const commentDraft = signal('')
  const cards = new Map<string, Signal<CardView>>()
  const order = signal<readonly string[]>([])
  const count = signal({ changes: 0, comments: 0 })
  const head = signal<HeadView>({ name: '', title: '', hasPdf: false, view: 'editor', editable: false, canSend: false, status: '', form: null })
  const conflict = signal<{ text: string; show: boolean } | null>(null)
  return {
    link, commentDraft,
    focusName() { document.getElementById('gr-name')?.focus() },
    hasCommentDraft() { return commentDraft.value.length > 0 },
    clearCommentDraft() { commentDraft.value = ''; flushIslands() },
    setLink(view) { link.value = view; flushIslands() },
    overall, cards, order, count, head, conflict,
    setOverallView(text) { overall.value = text; flushIslands() },
    setConflictView(view) { conflict.value = view; flushIslands() },
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
