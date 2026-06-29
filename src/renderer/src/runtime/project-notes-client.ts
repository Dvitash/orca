import type { GlobalSettings } from '../../../shared/types'
import { joinPath } from '../lib/path'
import { readRuntimeFileContent, runtimePathExists, writeRuntimeFile } from './runtime-file-client'

export const PROJECT_NOTES_FILE_NAME = 'notes.md'

export type ProjectNotesOperationContext = {
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
  worktreeId: string
  worktreePath: string
  connectionId?: string
}

export type ProjectNotesDocument = { content: string; filePath: string }

/** Returns the workspace-root notes path using the active host's path separator. */
export function getProjectNotesFilePath(worktreePath: string): string {
  return joinPath(worktreePath, PROJECT_NOTES_FILE_NAME)
}

/** Reads the active workspace notes document through the existing runtime file router. */
export async function readProjectNotes(
  context: ProjectNotesOperationContext
): Promise<ProjectNotesDocument> {
  const filePath = getProjectNotesFilePath(context.worktreePath)
  const operationContext = {
    settings: context.settings,
    worktreeId: context.worktreeId,
    worktreePath: context.worktreePath,
    connectionId: context.connectionId
  }

  try {
    if (!(await runtimePathExists(operationContext, filePath))) {
      await writeProjectNotes(context, '')
      return { content: '', filePath }
    }
    const document = await readRuntimeFileContent({
      settings: context.settings,
      filePath,
      relativePath: PROJECT_NOTES_FILE_NAME,
      worktreeId: context.worktreeId,
      connectionId: context.connectionId
    })
    return { content: document.content, filePath }
  } catch (error) {
    if (isMissingProjectNotesFileError(error)) {
      await writeProjectNotes(context, '')
      return { content: '', filePath }
    }
    throw error
  }
}

/** Writes the active workspace notes document through the existing runtime file router. */
export async function writeProjectNotes(
  context: ProjectNotesOperationContext,
  content: string
): Promise<void> {
  const filePath = getProjectNotesFilePath(context.worktreePath)

  await writeRuntimeFile(
    {
      settings: context.settings,
      worktreeId: context.worktreeId,
      worktreePath: context.worktreePath,
      connectionId: context.connectionId
    },
    filePath,
    content
  )
}

function isMissingProjectNotesFileError(error: unknown): boolean {
  let code: string | undefined
  let message = error instanceof Error ? error.message : ''
  if (error && typeof error === 'object') {
    if ('code' in error && typeof error.code === 'string') {
      code = error.code
    }
    if (!message && 'message' in error && typeof error.message === 'string') {
      message = error.message
    }
  }
  const normalizedMessage = message.toLowerCase()

  // Why: first open should create a blank notes.md instead of leaving a missing file.
  return (
    code === 'ENOENT' ||
    normalizedMessage.includes('enoent') ||
    normalizedMessage.includes('no such file')
  )
}
