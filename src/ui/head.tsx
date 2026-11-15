import type { PanelCommands, PanelModel } from './panel-model'

export function Head({ model, session }: { model: PanelModel; session: PanelCommands }) {
  const view = model.head.value
  return <>
    <div id="gr-title" class="gr-title">{view.title}</div>
    <div class="gr-views" role="group" aria-label="View" hidden={!view.hasPdf}>
      {(['editor', 'pdf', 'both'] as const).map(mode => <button type="button" id={`gr-view-${mode}`} key={mode} aria-pressed={view.view === mode} onClick={() => void session.setView(mode)}>{mode === 'pdf' ? 'PDF' : mode === 'editor' ? 'Editor' : 'Both'}</button>)}
    </div>
    <label class="gr-who">Your name <input id="gr-name" type="text" autoComplete="name" value={view.name} onChange={event => void session.setName(event.currentTarget.value)} /></label>
    <span id="gr-status" class="gr-status" role="status">{view.status}</span>
    <button id="gr-send" type="button" class="primary" disabled={!view.canSend} onClick={() => void session.send()}>Send review</button>
  </>
}
