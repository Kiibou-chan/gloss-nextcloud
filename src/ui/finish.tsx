import { OverallField } from './overall'
import { Cards, Count } from './panel'
import type { PanelCommands, PanelModel } from './panel-model'

const focusHeading = (el: HTMLElement | null) => { if (el && document.activeElement !== el) el.focus() }

export function Finish({ model, session }: { model: PanelModel; session: PanelCommands }) {
  const step = model.step.value, head = model.head.value
  if (step === 'comment') {
    return <div class="gr-fin-comment">
      <h2 tabIndex={-1} ref={focusHeading}>Finish your review</h2>
      <Count model={model} id="" />
      <OverallField model={model} session={session} />
      <div class="gr-fin-actions">
        <button type="button" id="gr-fin-back" onClick={() => model.setStep('review')}>Back to review</button>
        <button type="button" id="gr-fin-continue" class="primary" onClick={() => model.setStep('summary')}>Continue</button>
      </div>
    </div>
  }
  if (step === 'summary') {
    const overall = model.overall.value.trim()
    return <div class="gr-fin-summary">
      <h2 tabIndex={-1} ref={focusHeading}>Send your review</h2>
      <p class="gr-fin-meta">Draft <b>{head.title}</b></p>
      <Count model={model} id="" />
      <h3>Overall comment</h3>
      {overall ? <div class="gr-fin-text">{model.overall.value}</div> : <div class="gr-fin-text gr-fin-none">No overall comment</div>}
      <h3>Your changes and comments</h3>
      <Cards model={model} session={session} id="" />
      <div class="gr-fin-actions">
        <button type="button" id="gr-fin-summary-back" onClick={() => model.setStep('comment')}>Back</button>
        <button type="button" id="gr-send" class="primary" disabled={!head.canSend} onClick={() => void session.send()}>Send review</button>
      </div>
    </div>
  }
  return null
}
