import { createHash } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { IFilesystemProvider } from '../providers/types'
import { getCanonicalUserDataPath } from '../persistence'
import { resolveRuntimePath } from '../../shared/cross-platform-path'
import {
  normalizeProjectNotesContent,
  PROJECT_NOTES_FILE_NAME,
  type ProjectNotesDocument
} from '../../shared/project-notes'
export type { ProjectNotesDocument } from '../../shared/project-notes'

const PROJECT_NOTES_DIR_NAME = 'project-notes'

/** Reads the managed project notes document from the owning host. */
export async function readManagedProjectNotes(
  scopeId: string,
  provider?: IFilesystemProvider
): Promise<ProjectNotesDocument> {
  const filePath = getManagedProjectNotesFilePath(scopeId, provider)
  if (provider) {
    return readRemoteManagedProjectNotes(filePath, provider)
  }
  return readLocalManagedProjectNotes(filePath)
}

/** Writes the managed project notes document to the owning host. */
export async function writeManagedProjectNotes(
  scopeId: string,
  content: string,
  provider?: IFilesystemProvider
): Promise<{ ok: true }> {
  const filePath = getManagedProjectNotesFilePath(scopeId, provider)
  const normalizedContent = normalizeProjectNotesContent(content)
  if (provider) {
    await provider.createDir(remoteDirname(filePath))
    await provider.writeFile(filePath, normalizedContent)
    return { ok: true }
  }
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, normalizedContent, 'utf-8')
  return { ok: true }
}

/** Resolves the managed notes file path for a stable project notes scope. */
export function getManagedProjectNotesFilePath(
  scopeId: string,
  provider?: Pick<IFilesystemProvider, 'getUserDataPath'>
): string {
  const scopeHash = hashProjectNotesScopeId(scopeId)
  const remoteUserDataPath = provider?.getUserDataPath?.()
  if (provider) {
    if (!remoteUserDataPath) {
      throw new Error(
        'Remote Orca user data path is unavailable. Reconnect the SSH target and retry.'
      )
    }
    return joinRemoteManagedPath(
      remoteUserDataPath,
      PROJECT_NOTES_DIR_NAME,
      scopeHash,
      PROJECT_NOTES_FILE_NAME
    )
  }
  return join(
    getCanonicalUserDataPath(),
    PROJECT_NOTES_DIR_NAME,
    scopeHash,
    PROJECT_NOTES_FILE_NAME
  )
}

function hashProjectNotesScopeId(scopeId: string): string {
  const normalizedScopeId = scopeId.trim()
  if (!normalizedScopeId || normalizedScopeId.includes('\0')) {
    throw new Error('Project notes scope id is invalid')
  }
  return createHash('sha256').update(normalizedScopeId).digest('hex')
}

async function readLocalManagedProjectNotes(filePath: string): Promise<ProjectNotesDocument> {
  try {
    const storedContent = await readFile(filePath, 'utf-8')
    const content = normalizeProjectNotesContent(storedContent)
    if (content !== storedContent) {
      await writeFile(filePath, content, 'utf-8')
    }
    return { content, filePath }
  } catch (error) {
    if (!isMissingProjectNotesFileError(error)) {
      throw error
    }
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, '', 'utf-8')
    return { content: '', filePath }
  }
}

async function readRemoteManagedProjectNotes(
  filePath: string,
  provider: IFilesystemProvider
): Promise<ProjectNotesDocument> {
  try {
    const document = await provider.readFile(filePath)
    const content = normalizeProjectNotesContent(document.content)
    if (content !== document.content) {
      await provider.writeFile(filePath, content)
    }
    return { content, filePath }
  } catch (error) {
    if (!isMissingProjectNotesFileError(error)) {
      throw error
    }
    await provider.createDir(remoteDirname(filePath))
    await provider.writeFile(filePath, '')
    return { content: '', filePath }
  }
}

function joinRemoteManagedPath(basePath: string, ...segments: string[]): string {
  return segments.reduce((current, segment) => resolveRuntimePath(current, segment), basePath)
}

function remoteDirname(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  return index > 0 ? normalized.slice(0, index) : '/'
}

function isMissingProjectNotesFileError(error: unknown): boolean {
  const code =
    error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code
      : undefined
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return code === 'ENOENT' || message.includes('enoent') || message.includes('no such file')
}
