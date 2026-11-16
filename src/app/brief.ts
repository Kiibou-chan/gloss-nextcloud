export function brief(text: string): string { return text.replace(/\s+/g, ' ').trim() }

export function proposalLabel(original: string, proposal: string): string | null {
  const words = brief(proposal)
  if (words) return words
  return brief(original) ? null : '(line break)'
}
