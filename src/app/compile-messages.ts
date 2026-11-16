export type Fallback = 'package' | 'file' | 'font' | 'compile' | 'start' | 'large'

export const COMPILING = 'Showing your PDF while the draft compiles.'
export const FALLBACK: Readonly<Record<Fallback, string>> = {
  package: 'Showing your PDF; the draft uses a package the browser cannot load.',
  file: 'Showing your PDF; the draft reads a file the browser cannot load.',
  font: 'Showing your PDF; the draft uses a font the browser does not have.',
  compile: 'Showing your PDF; the draft does not compile in the browser.',
  start: 'Showing your PDF; the browser could not start the compiler.',
  large: 'Draft too large to compile live; showing your PDF.',
}
