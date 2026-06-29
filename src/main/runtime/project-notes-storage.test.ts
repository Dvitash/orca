import { readFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { mkdtempSync } from 'fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IFilesystemProvider } from '../providers/types'
import { PROJECT_NOTES_MAX_CHARS } from '../../shared/project-notes'
import {
  getManagedProjectNotesFilePath,
  readManagedProjectNotes,
  writeManagedProjectNotes
} from './project-notes-storage'

const mocks = vi.hoisted(() => ({
  getCanonicalUserDataPath: vi.fn()
}))

vi.mock('../persistence', () => ({
  getCanonicalUserDataPath: mocks.getCanonicalUserDataPath
}))

let tempDir = ''

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'orca-project-notes-'))
  mocks.getCanonicalUserDataPath.mockReturnValue(tempDir)
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('project notes storage', () => {
  it('creates missing local notes under Orca app data', async () => {
    const result = await readManagedProjectNotes('workspace-instance-1')

    expect(result).toMatchObject({ content: '' })
    expect(result.filePath).toContain(join(tempDir, 'project-notes'))
    expect(result.filePath).not.toContain('workspaces')
    await expect(readFile(result.filePath, 'utf-8')).resolves.toBe('')
  })

  it('writes local notes under the hashed managed scope', async () => {
    const oversizedContent = 'a'.repeat(PROJECT_NOTES_MAX_CHARS + 1)

    await writeManagedProjectNotes('workspace-instance-1', oversizedContent)
    const filePath = getManagedProjectNotesFilePath('workspace-instance-1')

    await expect(readFile(filePath, 'utf-8')).resolves.toHaveLength(PROJECT_NOTES_MAX_CHARS)
  })

  it('creates missing SSH notes under the remote Orca app data path', async () => {
    const provider = createMemoryProvider('/home/dvita/.config/orca')

    const result = await readManagedProjectNotes('workspace-instance-1', provider)

    expect(result).toEqual({
      content: '',
      filePath: getManagedProjectNotesFilePath('workspace-instance-1', provider)
    })
    expect(result.filePath).toMatch(/^\/home\/dvita\/\.config\/orca\/project-notes\//)
    expect(provider.createDir).toHaveBeenCalledWith(
      result.filePath.slice(0, result.filePath.lastIndexOf('/'))
    )
    expect(provider.writeFile).toHaveBeenCalledWith(result.filePath, '')
  })

  it('rejects SSH notes when the remote app data path is unavailable', async () => {
    const provider = createMemoryProvider(null)

    expect(() => getManagedProjectNotesFilePath('workspace-instance-1', provider)).toThrow(
      'Remote Orca user data path is unavailable'
    )
  })
})

function createMemoryProvider(userDataPath: string | null): IFilesystemProvider & {
  createDir: ReturnType<typeof vi.fn>
  writeFile: ReturnType<typeof vi.fn>
} {
  const files = new Map<string, string>()
  const provider = {
    getUserDataPath: vi.fn(() => userDataPath),
    createDir: vi.fn(async () => undefined),
    writeFile: vi.fn(async (filePath: string, content: string) => {
      files.set(filePath, content)
    }),
    readFile: vi.fn(async (filePath: string) => {
      const content = files.get(filePath)
      if (content === undefined) {
        throw Object.assign(new Error('No such file'), { code: 'ENOENT' })
      }
      return { content, isBinary: false, isImage: false }
    })
  }
  return provider as unknown as IFilesystemProvider & {
    createDir: ReturnType<typeof vi.fn>
    writeFile: ReturnType<typeof vi.fn>
  }
}
