import { useComputed, useSignal } from '@preact/signals'
import type { PanelCommands, PanelModel } from './panel-model'

export function Head({ model, session }: { model: PanelModel; session: PanelCommands }) {
  const view = model.head.value
  const draft = useSignal({ saved: view.name, name: view.name })
  const draftName = useComputed(() => draft.value.saved === model.head.value.name ? draft.value.name : model.head.value.name)
  return <>
    <div id="gr-title" class="gr-title">{view.title}</div>
    <div class="gr-views" role="group" aria-label="View" hidden={!view.hasPdf}>
      {(['editor', 'pdf', 'both'] as const).map(mode => <button type="button" id={`gr-view-${mode}`} key={mode} aria-pressed={view.view === mode} onClick={() => void session.setView(mode)}>{mode === 'pdf' ? 'PDF' : mode === 'editor' ? 'Editor' : 'Both'}</button>)}
    </div>
    <div class="gr-views gr-pdf-look" role="group" aria-label="PDF shows" hidden={!view.hasPdf || view.view === 'editor'}>
      {(['original', 'changes', 'new'] as const).map(look => <button type="button" id={`gr-pdf-look-${look}`} key={look} aria-pressed={view.pdfLook === look} onClick={() => void session.setPdfLook(look)}>{look === 'new' ? 'New text' : look === 'original' ? 'Original' : 'Changes'}</button>)}
    </div>
    {view.reviewable !== false && <label class="gr-who">Your name <input id="gr-name" type="text" disabled={view.sent} autoComplete="name" value={draftName.value} onInput={event => { draft.value = { saved: model.head.value.name, name: event.currentTarget.value } }} onChange={event => {
      const name = event.currentTarget.value.trim()
      if (name !== model.head.value.name) void session.setName(name)
    }} /></label>}
    {view.reviewable !== false && <button id="gr-send" type="button" class="primary" disabled={!view.canSend} onClick={() => void session.send()}>Send review</button>}
    {!!view.pdfNote && view.hasPdf && view.view !== 'editor' && <div class="gr-pdf-note-line">{view.pdfNote}</div>}
    <div id="gr-status" class="gr-status" role="status">{view.status}</div>
  </>
}
