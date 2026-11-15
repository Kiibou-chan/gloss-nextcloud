import { options } from 'preact'

let queued: (() => void) | undefined
let installed = false

export function installIslands(): void {
  if (installed) return
  installed = true
  options.debounceRendering = callback => {
    queued = callback
    queueMicrotask(() => {
      if (queued === callback) {
        queued = undefined
        callback()
      }
    })
  }
}

/** Draws pending island updates before returning to a hand-built caller. */
export function flushIslands(): void {
  const callback = queued
  queued = undefined
  callback?.()
}
