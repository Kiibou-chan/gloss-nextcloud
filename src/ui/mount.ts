import { h, render } from 'preact'
import { Head } from './head'
import { Panel } from './panel'
import { Finish } from './finish'
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
export function mountFinish(el: Element, model: PanelModel, session: PanelCommands): () => void {
  installIslands()
  render(h(Finish, { model, session }), el)
  flushIslands()
  return () => render(null, el)
}
