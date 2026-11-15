import { h, render } from 'preact'
import { Head } from './head'
import { Panel } from './panel'
import type { PanelCommands, PanelModel } from './panel-model'
import { flushIslands, installIslands } from './island'

export function mountHead(el: Element, model: PanelModel, session: PanelCommands): () => void {
  installIslands()
  render(h(Head, { model, session }), el)
  flushIslands()
  return () => render(null, el)
}
export function mountPanel(el: Element, model: PanelModel, session: PanelCommands): () => void {
  installIslands()
  render(h(Panel, { model, session }), el)
  flushIslands()
  return () => render(null, el)
}
