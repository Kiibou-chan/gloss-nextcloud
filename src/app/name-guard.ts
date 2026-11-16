import type { SessionState } from './session-state'

export function requestName(s: SessionState, head: () => void): boolean {
  if (!s.ports.reviewable || s.blocked || s.record?.sent || (!s.blankName && s.record?.name)) return false
  s.status = 'Enter your name first.'
  head(); s.ports.panel.focusName()
  return true
}
