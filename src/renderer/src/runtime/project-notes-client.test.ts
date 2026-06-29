import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
  RUNTIME_PROTOCOL_VERSION
} from '../../../shared/protocol-version'
import {
  getProjectNotesFilePath,
  readProjectNotes,
  writeProjectNotes,
  type ProjectNotesOperationContext
} from './project-notes-client'
import { clearRuntimeCompatibilityCacheForTests } from './runtime-rpc-client'

const fsReadFile = vi.fn()
const fsWriteFile = vi.fn()
const runtimeEnvironmentCall = vi.fn()
const runtimeEnvironmentTransportCall = vi.fn()

const localContext: ProjectNotesOperationContext = {
  settings: { activeRuntimeEnvironmentId: null },
  worktreeId: 'wt-1',
  worktreePath: 'C:\\Users\\dvita\\orca\\workspaces\\Verde'
}

beforeEach(() => {
  clearRuntimeCompatibilityCacheForTests()
  fsReadFile.mockReset()
  fsWriteFile.mockReset()
  runtimeEnvironmentCall.mockReset()
  runtimeEnvironmentTransportCall.mockReset()
  runtimeEnvironmentTransportCall.mockImplementation((args: { method: string }) => {
    if (args.method === 'status.get') {
      return Promise.resolve({
        id: 'status',
        ok: true,
        result: {
          runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
          minCompatibleRuntimeClientVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION
        },
        _meta: { runtimeId: 'remote-runtime' }
      })
    }
    return runtimeEnvironmentCall(args)
  })
  vi.stubGlobal('window', {
    api: {
      fs: {
        readFile: fsReadFile,
        writeFile: fsWriteFile
      },
      runtimeEnvironments: {
        call: runtimeEnvironmentTransportCall
      }
    }
  })
})

describe('project notes client', () => {
  it('computes the workspace-root notes path with the host separator', () => {
    expect(getProjectNotesFilePath('C:\\Users\\dvita\\orca\\workspaces\\Verde')).toBe(
      'C:\\Users\\dvita\\orca\\workspaces\\Verde\\notes.md'
    )
  })

  it('reads local workspace notes through the preload filesystem API', async () => {
    fsReadFile.mockResolvedValue({ content: 'remember smoke test', isBinary: false })

    await expect(readProjectNotes(localContext)).resolves.toEqual({
      content: 'remember smoke test',
      filePath: 'C:\\Users\\dvita\\orca\\workspaces\\Verde\\notes.md'
    })

    expect(fsReadFile).toHaveBeenCalledWith({
      filePath: 'C:\\Users\\dvita\\orca\\workspaces\\Verde\\notes.md',
      connectionId: undefined
    })
  })

  it('writes SSH workspace notes through the preload filesystem API with the connection id', async () => {
    await writeProjectNotes(
      {
        settings: { activeRuntimeEnvironmentId: null },
        worktreeId: 'wt-1',
        worktreePath: '/home/dvita/orca/workspaces/Verde',
        connectionId: 'ssh-1'
      },
      'pnpm test --filter smoke'
    )

    expect(fsWriteFile).toHaveBeenCalledWith({
      filePath: '/home/dvita/orca/workspaces/Verde/notes.md',
      content: 'pnpm test --filter smoke',
      connectionId: 'ssh-1'
    })
  })

  it('treats a missing notes file as a blank document', async () => {
    const error = Object.assign(new Error('ENOENT: no such file or directory, open notes.md'), {
      code: 'ENOENT'
    })
    fsReadFile.mockRejectedValue(error)

    await expect(readProjectNotes(localContext)).resolves.toEqual({
      content: '',
      filePath: 'C:\\Users\\dvita\\orca\\workspaces\\Verde\\notes.md'
    })
  })

  it('writes remote runtime workspace notes through the runtime files RPC', async () => {
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'write-1',
      ok: true,
      result: null,
      _meta: { runtimeId: 'remote-runtime' }
    })

    await writeProjectNotes(
      {
        settings: { activeRuntimeEnvironmentId: 'env-1' },
        worktreeId: 'wt-1',
        worktreePath: '/runtime/workspaces/Verde'
      },
      'remote note'
    )

    expect(runtimeEnvironmentCall).toHaveBeenCalledWith({
      selector: 'env-1',
      method: 'files.write',
      params: { worktree: 'id:wt-1', relativePath: 'notes.md', content: 'remote note' },
      timeoutMs: 15_000
    })
    expect(fsWriteFile).not.toHaveBeenCalled()
  })
})
