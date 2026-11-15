import type { Backup, Failure, Scheduler } from './ports'

type Pending = NonNullable<Backup['pending']>
export type Outcome = { revision: number } | Failure | { idle: true }
type Options = {
  save(body: string, baseRevision: number, options?: { keepalive?: boolean }): Promise<{ revision: number } | Failure>
  enabled?(): boolean
  body(revision: number): string | null
  scheduler: Scheduler
  onStatus(status: string, outcome?: Outcome): void
  onChange?(): void
  revision?: number
  pending?: Pending | null
  dirty?: boolean
  refusal?: Failure | null
}

function byteLength(text: string): number {
  let bytes = 0
  for (const character of text) {
    const point = character.codePointAt(0)!
    bytes += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4
  }
  return bytes
}

/** One immutable request survives retries; later edits wait for its acknowledgement. */
export class SaveQueue {
  revision: number
  pending: Pending | null
  dirty: boolean
  private version = 0
  private pendingVersion = 0
  private attempt = 0
  refusal: Failure | null = null
  private disposed = false
  private flight: Promise<Outcome> | null = null
  private cancel: (() => void) | null = null
  constructor(private readonly options: Options) {
    this.revision = options.revision ?? 0
    this.pending = options.pending ?? null
    this.dirty = options.dirty ?? !!this.pending
    this.refusal = options.refusal && [400, 403, 404, 409, 410, 413].includes(options.refusal.status) ? options.refusal : null
    if (this.pending && options.body(this.pending.revision + 1) !== this.pending.body) this.version++
    if (this.dirty && !this.pending && !this.refusal) this.changed()
  }
  changed(): void {
    if (this.disposed) return
    this.version++; this.dirty = true; this.refusal = null
    if (!this.pending || (!this.flight && !this.cancel)) {
      this.cancel?.()
      this.cancel = this.options.scheduler.after(5000, () => { this.cancel = null; void this.flush() })
    }
  }
  online(): void {
    if (!this.refusal && this.dirty) { this.cancel?.(); this.cancel = null; void this.flush() }
  }
  pagehide(): void {
    if (this.disposed || this.flight || this.refusal || !this.dirty || this.options.enabled?.() === false) return
    const body = this.pending?.body ?? this.options.body(this.revision + 1)
    if (body && byteLength(body) < 65_536) void this.run(true)
  }
  flush(): Promise<Outcome> {
    if (this.disposed || this.refusal || !this.dirty || this.options.enabled?.() === false) return Promise.resolve({ idle: true })
    this.cancel?.(); this.cancel = null
    if (this.flight) return this.flight
    return this.run(false)
  }
  private run(keepalive: boolean): Promise<Outcome> {
    if (this.flight) return this.flight
    if (!this.pending) {
      const body = this.options.body(this.revision + 1)
      if (!body) return Promise.resolve({ idle: true })
      this.pending = { body, revision: this.revision }; this.pendingVersion = this.version
    }
    const pending = this.pending
    const sent = (() => { try { return JSON.parse(pending.body).sent === true } catch { return false } })()
    // Persist pending synchronously, before starting even a keepalive request.
    this.options.onChange?.()
    this.options.onStatus(sent ? 'Sending…' : 'Saving…')
    const execute = async (): Promise<Outcome> => {
      let result: { revision: number } | Failure
      try {
        result = byteLength(pending.body) > 1_048_576 ? { status: 413, error: 'tooLarge' }
          : await (keepalive ? this.options.save(pending.body, pending.revision, { keepalive: true }) : this.options.save(pending.body, pending.revision))
      } catch { result = { status: 0, error: 'network' } }
      if (this.disposed) return result
      if ('status' in result) {
        if (result.status === 0 || result.status === 423 || result.status >= 500) {
          const delay = [2, 5, 15][Math.min(this.attempt++, 2)]!
          this.options.onStatus(`${sent ? 'Not sent' : 'Not saved'} yet; trying again in ${delay} s`, result)
          this.cancel = this.options.scheduler.after(delay * 1000, () => { this.cancel = null; void this.flush() })
        } else {
          this.pending = null; this.refusal = result; this.attempt = 0
          this.options.onStatus(result.status === 412 ? 'Your session ended. Reload the page to continue; your changes are kept in this browser.' : `Not ${sent ? 'sent' : 'saved'}: ${result.error}`, result)
        }
      } else {
        this.revision = result.revision; this.pending = null; this.attempt = 0
        this.dirty = this.version !== this.pendingVersion
        this.options.onStatus(sent ? 'Review sent. Thank you.' : 'Saved', result)
      }
      this.options.onChange?.()
      return result
    }
    const flight = execute().then(async result => {
      this.flight = null
      if (!this.disposed && !('status' in result) && this.dirty) return this.flush()
      return result
    })
    this.flight = flight
    return flight
  }
  dispose(): void { this.disposed = true; this.cancel?.(); this.cancel = null }
}
