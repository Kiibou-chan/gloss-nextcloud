import { useComputed, useSignal } from '@preact/signals'
import type { PanelCommands, PanelModel } from './panel-model'

function focusOnce(el: HTMLInputElement | null) { if (el && document.activeElement !== el) el.focus() }

export function Head({ model, session }: { model: PanelModel; session: PanelCommands }) {
  const view = model.head.value
  const draft = useSignal({ saved: view.name, name: view.name })
  const editing = useSignal(false)
  const commit = (value: string) => { const name = value.trim(); if (name && name !== model.head.value.name) void session.setName(name) }
  const draftName = useComputed(() => draft.value.saved === model.head.value.name ? draft.value.name : model.head.value.name)
  const status = view.status === 'Enter your name to start.' && draftName.value.trim() ? '' : view.status
  return <>
    <div id="gr-title" class="gr-title">{view.title}</div>
    <div class="gr-views" role="group" aria-label="View" hidden={!view.hasPdf}>
      {(['editor', 'pdf', 'both'] as const).map(mode => <button type="button" id={`gr-view-${mode}`} key={mode} aria-pressed={view.view === mode} onClick={() => void session.setView(mode)}>{mode === 'pdf' ? 'PDF' : mode === 'editor' ? 'Editor' : 'Both'}</button>)}
    </div>
    <div class={view.view === 'editor' ? 'gr-views gr-pdf-look gr-off' : 'gr-views gr-pdf-look'} role="group" aria-label="PDF shows" hidden={!view.hasPdf}>
      {(['original', 'changes', 'new'] as const).map(look => <button type="button" id={`gr-pdf-look-${look}`} key={look} aria-pressed={view.pdfLook === look} onClick={() => void session.setPdfLook(look)}>{look === 'new' ? 'New text' : look === 'original' ? 'Original' : 'Changes'}</button>)}
    </div>
    {view.reviewable !== false && !!view.title && !view.name && !view.sent && <section class="gr-welcome" aria-label="Start reviewing">
      <form class="gr-welcome-card" onSubmit={event => { event.preventDefault(); commit(draftName.value) }}>
        <h2>{view.title}</h2>
        <label>Your name <input id="gr-name" type="text" maxLength={100} autoComplete="name" value={draftName.value} ref={focusOnce} onInput={event => { draft.value = { saved: model.head.value.name, name: event.currentTarget.value } }} onChange={event => commit(event.currentTarget.value)} /></label>
        <p class="gr-welcome-status" role="status">{status}</p>
        <button type="submit" class="primary" disabled={!draftName.value.trim()}>Start reviewing</button>
      </form>
    </section>}
    {view.reviewable !== false && !!view.name && <button type="button" class="gr-name-quiet" aria-expanded={editing.value} disabled={view.sent} onClick={() => { editing.value = !editing.value }}>Reviewing as <b>{view.name}</b></button>}
    {view.reviewable !== false && !!view.name && editing.value && !view.sent && <form class="gr-name-pop" onSubmit={event => { event.preventDefault(); commit(draftName.value); editing.value = false }} onKeyDown={event => { if (event.key === 'Escape') editing.value = false }}>
      <input id="gr-name" type="text" maxLength={100} aria-label="Your name" autoComplete="name" value={draftName.value} ref={focusOnce} onInput={event => { draft.value = { saved: model.head.value.name, name: event.currentTarget.value } }} />
      <button type="submit" class="primary" disabled={!draftName.value.trim()}>Save</button>
    </form>}
    {view.reviewable !== false && <button id="gr-finish" type="button" class="primary" disabled={!view.canSend} onClick={() => model.setStep('comment')}>Finish review</button>}
    {!!view.pdfNote && view.hasPdf && view.view !== 'editor' && <div class="gr-pdf-note-line" title={view.pdfNote}>{view.pdfNote}</div>}
    <div id="gr-status" class="gr-status" role="status" title={status}>{status}</div>
  </>
}
