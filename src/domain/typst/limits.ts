/** Past these sizes a recompile takes seconds in the browser (measured: 3.1 s at 200 proposals, 5 to 7 s at 10,000 lines and 2,000 proposals), so the draft is not compiled. */
export const MAX_DRAFT_LINES = 2000
export const MAX_PROPOSALS = 400

export function tooLargeToCompile(draft: string, proposals: number): boolean {
  const lines = draft.endsWith('\n') ? draft.split('\n').length - 1 : draft.split('\n').length
  return lines > MAX_DRAFT_LINES || proposals > MAX_PROPOSALS
}
