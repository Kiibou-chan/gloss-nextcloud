export function brief(text: string): string { return text.replace(/\s+/g, ' ').trim() }

export const BREAK_LABEL = '(line break)'

export function proposalLabel(original: string, proposal: string): string | null {
  const words = brief(proposal)
  if (words) return words
  return brief(original) ? null : BREAK_LABEL
}
