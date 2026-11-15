import { SessionState } from './session-state'

export const REVIEW_KEY = /^[A-Za-z0-9]{16}$/

export class LinkKey {
  private linkMessage = ''
  constructor(private readonly s: SessionState) {}
  reviewLink(): string | null {
    return this.s.saved && !this.s.blocked && this.s.record && this.s.key && this.s.page.address ? `${this.s.page.address.split('#')[0]}#${this.s.key}` : null
  }
  publishLink(): void {
    const url = this.reviewLink()
    this.s.ports.panel.setLink(url ? { url, message: this.linkMessage } : null)
  }
  async copyReviewLink(): Promise<void> {
    const url = this.reviewLink()
    if (this.s.disposed || !url) return
    let copied = false
    try { copied = await this.s.ports.clipboard.write(url) } catch { /* A denied clipboard remains selectable. */ }
    if (this.s.disposed) return
    this.linkMessage = copied ? 'Link copied.' : 'Copy failed; select the link and copy it.'
    this.publishLink()
  }
  clearLinkMessage(): void { this.linkMessage = '' }
}
