import type { PanelCommands, PanelModel } from './panel-model'

export function Overall({ model, session }: { model: PanelModel; session: PanelCommands }) {
  return <div class="gr-form">
    <label for="gr-overall">Overall comment
      <textarea id="gr-overall" rows={5} value={model.overall.value} readOnly={!model.head.value.editable}
        onInput={event => { if (model.head.value.editable) session.setOverall(event.currentTarget.value) }} />
    </label>
  </div>
}
