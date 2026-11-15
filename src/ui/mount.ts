import { h, render } from 'preact'
import { Head } from './head'
import { Panel } from './panel'
import type { PanelCommands, PanelModel } from './panel-model'

export function mountHead(el: Element, model: PanelModel, session: PanelCommands): () => void {
  render(h(Head, { model, session }), el)
  return () => render(null, el)
}
export function mountPanel(el: Element, model: PanelModel, session: PanelCommands): () => void {
  render(h(Panel, { model, session }), el)
  return () => render(null, el)
}
