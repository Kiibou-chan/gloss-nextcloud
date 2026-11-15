import type { Clock } from '../../app/ports'
export const browserClock: Clock = { now: () => new Date().toISOString(), local: at => new Date(at).toLocaleString() }
