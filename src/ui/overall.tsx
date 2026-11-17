import { entersText } from '../app/text-input'
import type { PanelCommands, PanelModel } from './panel-model'

export function Overall({ model }: { model: PanelModel }) {
  const { editable, reviewable, sent } = model.head.value
  if (!editable && (reviewable === false || sent || model.overall.value)) {
    return model.overall.value ? <div class="gr-overall-text"><div>Overall comment</div><p>{model.overall.value}</p></div> : null
  }
  return null
}

export function OverallField({ model, session }: { model: PanelModel; session: PanelCommands }) {
  const { editable } = model.head.value
  return <textarea id="gr-overall" rows={8} aria-label="Overall comment" placeholder="Overall comment (optional)" value={model.overall.value} readOnly={!editable}
    onPaste={() => { if (!editable) session.requestName?.() }}
    onKeyDown={event => { if (!editable && entersText(event)) { event.preventDefault(); session.requestName?.() } }}
    onInput={event => { if (model.head.value.editable) session.setOverall(event.currentTarget.value) }} />
}
