import { entersText } from '../app/text-input'
import type { PanelCommands, PanelModel } from './panel-model'

export function Overall({ model, session }: { model: PanelModel; session: PanelCommands }) {
  const { editable, reviewable, sent } = model.head.value
  if (!editable && (reviewable === false || sent || model.overall.value)) {
    return model.overall.value ? <div class="gr-overall-text"><div>Overall comment</div><p>{model.overall.value}</p></div> : null
  }
  return <div class="gr-form">
    <label for="gr-overall">Overall comment
      <textarea id="gr-overall" rows={5} value={model.overall.value} readOnly={!model.head.value.editable}
        onPaste={() => { if (!editable) session.requestName?.() }}
        onKeyDown={event => { if (!editable && entersText(event)) session.requestName?.() }}
        onInput={event => { if (model.head.value.editable) session.setOverall(event.currentTarget.value) }} />
    </label>
  </div>
}
