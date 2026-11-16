import { REVIEW_KEY } from './link-key'
import { readBackup, keptText } from './backup'
import { readReview } from '../domain/format/read'
import type { ReviewRecord } from '../domain/format/record'
import { sourceKey } from '../domain/pdf/match'
import { DraftReview } from '../domain/review/draft-review'
import { languageOf } from '../domain/source/language'
import { parseTypst, plainOps } from '../domain/source/typst-parse'
import type { Backup } from './ports'

import { SessionState, type SessionActions } from './session-state'

export class Lifecycle {
  constructor(private readonly s: SessionState, private readonly actions: Pick<SessionActions, 'backup' | 'changed' | 'createQueue' | 'head' | 'install' | 'refusal' | 'render' | 'setView'>) {}
  async start(): Promise<void> {
    try {
      const d = this.s.main ? null : await this.s.ports.api.draft()
      if (this.s.disposed) return
      const main = this.s.main ?? d?.files.find(f => f.file === d.main)
      if (!main) { this.s.status = 'The draft could not be found.'; this.actions.head(); return }
      this.s.file = main.file; this.s.draft = main.text; this.s.etag = main.etag
      this.s.ops = (this.s.main?.language ?? languageOf(this.s.file)) === 'typst' ? parseTypst(this.s.draft) : plainOps(this.s.draft)
      this.s.source = sourceKey(this.s.file, this.s.draft, this.s.ops)
      this.s.review = new DraftReview(this.s.file, this.s.draft)
      this.s.ports.editor.setText(this.s.review.applied()); this.actions.render()
      await this.actions.setView(this.s.ports.store.view() ?? 'editor')
      if (!this.s.ports.reviewable) { this.s.status = 'This link is not set up for reviewing.'; this.actions.head(); return }
      const fragment = this.s.page.fragment.startsWith('#') && REVIEW_KEY.test(this.s.page.fragment.slice(1)) ? this.s.page.fragment.slice(1) : null
      const stored = this.s.ports.store.rememberedKey()
      if (fragment && stored && fragment !== stored && this.s.ports.store.read(stored)?.dirty) {
        this.s.blocked = true
        this.s.status = "Changes for another review in this browser are still waiting; open that review's link to continue."
        this.actions.head(); return
      }
      const remembered = fragment ?? stored
      if (remembered && REVIEW_KEY.test(remembered)) {
        this.s.key = remembered
        const backup = this.s.ports.store.read(remembered)
        this.s.saved = backup?.saved === true
        await this.loadReview('', backup)
      }
    } catch { this.s.status = 'Could not load the draft.'; this.actions.head() }
  }
  async setName(name: string): Promise<void> {
    if (this.s.disposed || !this.s.ports.reviewable || this.s.blocked || !this.s.review || this.s.record?.sent) return
    name = name.trim()
    if (name === this.s.record?.name && !this.s.blankName) return
    if ([...name].length > 100) {
      this.s.status = 'Your name must be 100 characters or fewer.'
      this.actions.head(); return
    }
    if (this.s.record) {
      this.s.blankName = !name
      if (name) this.s.record.name = name
      this.actions.changed()
      if (!name) { this.s.status = 'Enter your name to continue.'; this.actions.head() }
      return
    }
    this.s.pendingName = name
    if (!name) { this.actions.render(); return }
    if (!this.s.key) {
      const remembered = this.s.ports.store.rememberedKey()
      this.s.key = remembered && REVIEW_KEY.test(remembered) ? remembered : this.s.ports.ids.key()
      this.s.saved = !!remembered && REVIEW_KEY.test(remembered) && this.s.ports.store.read(this.s.key)?.saved === true
    }
    if (this.s.saved) await this.loadReview(name, this.s.ports.store.read(this.s.key))
    else {
      this.actions.install(this.emptyRecord(name))
      this.s.ports.store.remember(this.s.key); this.actions.createQueue(); this.actions.backup(false)
    }
  }
  emptyRecord(name: string): ReviewRecord {
    return { revision: 0, name, draft: { file: this.s.file, etag: this.s.etag }, sent: false, sentAt: null, updatedAt: this.s.ports.clock.now(), items: [] }
  }
  restore(backup: Backup): void {
    const result = readBackup(backup.review, this.s.ports.ids)
    if (!result) return
    if ('error' in result) { this.s.status = result.error; this.actions.head(); return }
    result.record.revision = backup.revision
    this.actions.install(result.record)
  }
  async loadReview(name: string, backup: Backup | null): Promise<void> {
    const generation = ++this.s.generation
    this.s.loading = true; this.actions.render()
    try {
      const opened = await this.s.ports.api.open(this.s.key)
      if (this.s.disposed || generation !== this.s.generation) return
      if ('status' in opened) {
        const message = this.actions.refusal(opened, 'Could not load your review: ')
        this.s.status = message.text; this.s.blocked ||= message.blocks
        if (opened.status === 403) this.s.ports.reviewable = false
        return
      }
      if (opened.review === null) {
        this.s.saved = false
        if (!name && backup) {
          const result = readBackup(backup.review, this.s.ports.ids)
          if (result && !('error' in result)) name = result.record.name
        }
        if (backup) {
          this.restore(backup)
          if (!backup.dirty && this.s.record?.sent) this.s.saved = backup.saved
          else {
            this.restore({ ...backup, revision: 0 })
            backup = { ...backup, revision: 0, pending: backup.pending?.revision === 0 ? backup.pending : null, saved: false, dirty: true }
          }
        } else if (name) this.actions.install(this.emptyRecord(name))
      } else {
        const result = readReview(opened.rawReview ?? opened.review, () => this.s.ports.ids.item())
        if ('error' in result) { this.s.status = result.error; return }
        this.s.saved = true
        if ('revision' in opened) result.record.revision = opened.revision
        this.actions.install(result.record)
      }
      if (backup?.dirty) {
        const serverRevision = this.s.record?.revision ?? 0
        let pendingRevision: number | null = null
        try { pendingRevision = backup.pending ? JSON.parse(backup.pending.body).revision : null } catch { /* Invalid pending data cannot match. */ }
        if (backup.revision === serverRevision || pendingRevision === serverRevision) this.restore(backup)
        else {
          this.keepConflict(backup)
          this.s.status = `Changes made in this browser at ${this.s.ports.clock.local?.(backup.at) ?? backup.at} were not restored, as the review changed elsewhere.`
          backup = null
        }
      }
      if (opened.review === null && name && this.s.record) this.s.record.name = name
      this.actions.createQueue(backup?.dirty ? backup : null)
      this.s.ports.store.remember(this.s.key)
      if (backup?.dirty && backup.pending) await this.s.queue?.flush()
      else if (!backup?.dirty && this.s.record && !this.s.status) this.s.status = 'Saved'
    } catch { if (generation === this.s.generation) this.s.status = 'Could not load your review.' }
    finally { if (generation === this.s.generation) { this.s.loading = false; this.actions.render() } }
  }
  keepConflict(backup: Backup): void {
    this.s.ports.store.keepConflict(this.s.key, backup)
    this.s.conflictText = keptText(backup, this.s.ports.ids)
    this.s.ports.panel.setConflictView({ text: this.s.conflictText, show: false })
  }
  showKeptChanges(): void {
    const backup = this.s.ports.store.readConflict(this.s.key)
    const text = this.s.conflictText ?? (backup ? keptText(backup, this.s.ports.ids) : '')
    this.s.ports.panel.setConflictView({ text, show: true })
  }
}
