import { useLayoutEffect, useRef } from 'preact/hooks'
import type { PanelCommands, PanelModel } from './panel-model'

export function CommentForm({ model, session }: { model: PanelModel; session: PanelCommands }) {
  const { form, editable } = model.head.value
  const textarea = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    if (!form || !textarea.current) return
    textarea.current.value = ''
    if (form.focus) textarea.current.focus()
  }, [form])
  return <>
    <div id="gr-hint" class="gr-hint" hidden={!!form}>
      Type in the editor to propose new wording; your changes show struck and underlined.
      {' '}Select words in the editor or the PDF to comment on them.
    </div>
    <form id="gr-form" class="gr-form" hidden={!form} onSubmit={event => {
      event.preventDefault()
      const text = textarea.current?.value.trim()
      if (form && editable && text) session.commentOn(form.target, text)
    }}>
      <blockquote id="gr-quote" class="gr-quote">{form?.quote || '(new words)'}</blockquote>
      <label>Comment <textarea id="gr-comment" rows={3} ref={textarea} disabled={!editable} /></label>
      <div class="gr-actions">
        <button type="submit" class="primary" disabled={!editable}>Add</button>
        <button type="button" id="gr-cancel" onClick={() => session.cancelForm()}>Cancel</button>
      </div>
    </form>
  </>
}
