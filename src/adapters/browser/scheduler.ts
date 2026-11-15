import type { Scheduler } from '../../app/ports'
export const browserScheduler: Scheduler = {
  after(ms, run) {
    const timer = setTimeout(run, ms)
    return () => clearTimeout(timer)
  },
}
