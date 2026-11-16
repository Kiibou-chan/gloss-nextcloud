/** One compiler message; `line` is one-based in the compiled main file, null when it names another file or none. */
export type Diagnostic = { severity: 'error' | 'warning'; message: string; line: number | null }
