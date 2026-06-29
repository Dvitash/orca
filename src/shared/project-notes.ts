export const PROJECT_NOTES_FILE_NAME = 'notes.md'
export const PROJECT_NOTES_MAX_CHARS = 5_000
export const PROJECT_NOTES_WARNING_THRESHOLD_CHARS = Math.floor(PROJECT_NOTES_MAX_CHARS * 0.95)

export type ProjectNotesDocument = {
  content: string
  filePath: string
}

/** Clamps project notes to the persisted character limit. */
export function normalizeProjectNotesContent(content: string): string {
  return content.length > PROJECT_NOTES_MAX_CHARS
    ? content.slice(0, PROJECT_NOTES_MAX_CHARS)
    : content
}
