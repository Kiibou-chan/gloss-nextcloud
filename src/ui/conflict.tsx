export function Conflict({ text, show, onShow }: { text: string; show: boolean; onShow(): void }) {
  return <section class="gr-conflict" aria-label="Changes kept in this browser">
    <button type="button" onClick={onShow}>Show the changes from this browser</button>
    {show && <label>Changes kept in this browser<textarea readOnly value={text} rows={12} /></label>}
  </section>
}
