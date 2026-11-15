import { useLayoutEffect, useRef } from 'preact/hooks'
import type { PanelCommands, PanelModel } from './panel-model'

export function CommentForm({ model, session }: { model: PanelModel; session: PanelCommands }) {
  const { form, editable, reviewable, sent } = model.head.value
  const textarea = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    if (!form || !textarea.current) return
    if (form.focus) textarea.current.focus()
  }, [form])
  return <>
    <div id="gr-hint" class="gr-hint" hidden={!!form || reviewable === false || !!sent}>
      Type in the editor to propose new wording; your changes show struck and underlined.
      {' '}Select words with the pointer in the editor or the PDF to comment on them.
      {' '}Use Ctrl+Alt+M or Comment on selection for a keyboard selection.
      <button type="button" onClick={() => session.commentSelection?.()}>Comment on selection</button>
    </div>
    <form id="gr-form" class="gr-form" hidden={!form} onSubmit={event => {
      event.preventDefault()
      const text = model.commentDraft.value.trim()
      if (form && !form.detached && editable && text) session.commentOn(form.target, text)
    }}>
      <blockquote id="gr-quote" class="gr-quote">{form?.quote ? form.quote.length > 200 ? form.quote.slice(0, 200) + '…' : form.quote : '(new words)'}</blockquote>
      <label>Comment <textarea id="gr-comment" rows={3} ref={textarea} value={model.commentDraft.value} onInput={event => { model.commentDraft.value = event.currentTarget.value; session.setCommentDraft?.(event.currentTarget.value) }} disabled={!editable} /></label>
      <div class="gr-actions">
        <button type="submit" class="primary" disabled={!editable || form?.detached}>Add</button>
        <button type="button" id="gr-cancel" onClick={() => session.cancelForm()}>Cancel</button>
      </div>
    </form>
  </>
}
