import { classify } from './failure'
import { writeReview } from '../domain/format/write'
import type { Backup } from './ports'
import { SaveQueue } from './save-queue'

import { SessionState, type SessionActions } from './session-state'

export class SessionSave {
  private cancelBackup: (() => void) | null = null
  constructor(private readonly s: SessionState, private readonly actions: Pick<SessionActions, 'clearLinkMessage' | 'editable' | 'head' | 'keepConflict' | 'overallText' | 'refusal' | 'render'>) {}
  serialise(revision: number): string | null {
    if (!this.s.record || !this.s.review) return null
    return writeReview({ ...this.s.record, revision: Math.max(1, revision), draft: { file: this.s.file, etag: this.s.etag }, items: [...this.s.review.items(), ...this.s.record.items.filter(i => i.kind === 'overall')] }, this.s.unplaced)
  }
  body(revision: number): string | null {
    if (this.s.blankName || !this.s.record?.name || !this.s.review || this.s.blocked) return null
    const actual = this.s.ports.editor.text()
    if (actual !== this.s.review.applied()) {
      this.s.review.rebuild(actual, () => this.s.ports.ids.item(), this.s.ports.clock.now())
      this.s.ports.diagnostic('The editor and review differed; the review was rebuilt.')
      this.actions.render()
    }
    return this.serialise(revision)
  }
  createQueue(backup: Backup | null = null): void {
    this.s.queue?.dispose()
    this.s.queue = new SaveQueue({
      key: this.s.key,
      enabled: () => !this.s.blankName && !this.s.blocked,
      scheduler: this.s.ports.scheduler, revision: backup?.revision ?? this.s.record?.revision ?? 0,
      pending: backup?.pending, dirty: backup?.dirty ?? false,
      body: revision => this.body(revision),
      save: (body, base, options) => this.s.ports.api.save(this.s.key, body, base, options),
      onStatus: (status, outcome) => {
        if (outcome && 'status' in outcome && classify(outcome) !== 'retry') {
          if (this.s.record?.sent) { this.s.record.sent = false; this.s.record.sentAt = null }
          this.s.status = classify(outcome) === 'session' ? status : this.actions.refusal(outcome, 'Not saved: ')
          if (outcome.status === 409 && outcome.error === 'conflict') {
            this.s.saved = true
            this.backup(true)
            const backup = this.s.ports.store.read(this.s.key)
            if (backup) {
              this.actions.keepConflict(backup)
            }
          }
        } else {
          if (outcome && 'revision' in outcome && this.s.record) {
            this.s.record.revision = outcome.revision; this.s.saved = true
          }
          this.s.status = status === 'Saved' ? (this.s.record?.sent ? 'Sending…' : this.s.unplacedStatus || status) : status
        }
        this.actions.render()
      },
      onChange: () => { this.backup(this.s.queue?.dirty ?? true); this.actions.head() },
    })
    if (this.s.queue.refusal) this.s.status = this.actions.refusal(this.s.queue.refusal, 'Not saved: ')
    if (backup?.dirty) this.backup(true)
    this.actions.render()
  }
  backup(dirty: boolean): void {
    const review = this.serialise(this.s.record?.revision ?? 0)
    if (!review || !this.s.key || !this.s.record) return
    this.s.backupFailed = !this.s.ports.store.write(this.s.key, {
      review, revision: this.s.queue?.revision ?? this.s.record.revision, saved: this.s.saved, dirty,
      pending: this.s.queue?.pending ?? null, at: this.s.ports.clock.now(),
    })
  }
  pagehide(): void {
    this.cancelBackup?.(); this.cancelBackup = null
    this.backup(this.s.queue?.dirty ?? false)
    this.s.queue?.pagehide()
    this.backup(this.s.queue?.dirty ?? false)
  }
  changed(): void {
    if (!this.s.record) return
    this.actions.clearLinkMessage()
    this.s.record.updatedAt = this.s.ports.clock.now(); this.s.status = 'Saving…'; this.s.queue?.changed(); this.actions.render()
    this.cancelBackup?.(); this.cancelBackup = this.s.ports.scheduler.after(300, () => { this.cancelBackup = null; this.backup(this.s.queue?.dirty ?? false); this.actions.head() })
  }
  async send(): Promise<void> {
    if (!this.actions.editable() || (!this.s.review?.items().length && !this.actions.overallText().trim())) return
    this.s.record!.sent = true; this.s.record!.sentAt = this.s.ports.clock.now(); this.s.record!.updatedAt = this.s.record!.sentAt
    this.s.form = null; this.s.status = 'Sending…'; this.s.queue?.changed(); this.actions.render()
    await this.s.queue?.flush()
  }
  dispose(): void { this.s.queue?.dispose(); this.cancelBackup?.(); this.cancelBackup = null }
}
