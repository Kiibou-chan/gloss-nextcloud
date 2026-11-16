type Listener = (ids: readonly string[]) => void

/** Tracks which marks drew nothing on the pages drawn so far, and reports ids that no drawn page shows. */
export function createUndrawnTracker(drawnPages: () => readonly { marks: HTMLElement }[]) {
  const missing = new Map<number, Set<string>>()
  let listener: Listener | undefined
  const report = () => {
    const drawn = new Set<string>()
    for (const page of drawnPages()) for (const child of page.marks.children) drawn.add((child as HTMLElement).dataset.id!)
    const ids = new Set<string>()
    for (const set of missing.values()) for (const id of set) if (!drawn.has(id)) ids.add(id)
    listener?.([...ids])
  }
  return {
    set(page: number, ids: ReadonlySet<string>) { if (ids.size) missing.set(page, new Set(ids)); else missing.delete(page); report() },
    forget(page: number) { missing.delete(page) },
    listen(next: Listener) { listener = next; return () => { if (listener === next) listener = undefined } },
  }
}
