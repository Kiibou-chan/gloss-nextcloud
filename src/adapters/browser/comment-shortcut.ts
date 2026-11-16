export function isCommentShortcut(event: KeyboardEvent): boolean {
  return event.ctrlKey && event.altKey && event.code === 'KeyM'
}
