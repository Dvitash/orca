import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
  RUNTIME_PROTOCOL_VERSION
} from '../../../shared/protocol-version'
import { PROJECT_NOTES_MAX_CHARS } from '../../../shared/project-notes'
import {
  readProjectNotes,
  writeProjectNotes,
  type ProjectNotesOperationContext
} from './project-notes-client'
import { clearRuntimeCompatibilityCacheForTests } from './runtime-rpc-client'

const runtimeCall = vi.fn()
const runtimeEnvironmentCall = vi.fn()
const runtimeEnvironmentTransportCall = vi.fn()

const localContext: ProjectNotesOperationContext = {
  settings: { activeRuntimeEnvironmentId: null },
  scopeId: 'workspace-instance-1'
}

beforeEach(() => {
  clearRuntimeCompatibilityCacheForTests()
  runtimeCall.mockReset()
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
      runtime: {
        call: runtimeCall
      },
      runtimeEnvironments: {
        call: runtimeEnvironmentTransportCall
      }
    }
  })
})

describe('project notes client', () => {
  it('reads local workspace notes through the runtime RPC API', async () => {
    runtimeCall.mockResolvedValue({
      id: 'read-1',
      ok: true,
      result: {
        content: 'remember smoke test',
        filePath: '/home/dvita/.config/orca/project-notes/hash/notes.md'
      }
    })

    await expect(readProjectNotes(localContext)).resolves.toEqual({
      content: 'remember smoke test',
      filePath: '/home/dvita/.config/orca/project-notes/hash/notes.md'
    })

    expect(runtimeCall).toHaveBeenCalledWith({
      method: 'projectNotes.read',
      params: { scopeId: 'workspace-instance-1' }
    })
  })

  it('writes SSH workspace notes through local runtime RPC with the connection id', async () => {
    runtimeCall.mockResolvedValue({ id: 'write-1', ok: true, result: { ok: true } })

    await writeProjectNotes(
      {
        settings: { activeRuntimeEnvironmentId: null },
        scopeId: 'workspace-instance-1',
        connectionId: 'ssh-1'
      },
      'pnpm test --filter smoke'
    )

    expect(runtimeCall).toHaveBeenCalledWith({
      method: 'projectNotes.write',
      params: {
        scopeId: 'workspace-instance-1',
        connectionId: 'ssh-1',
        content: 'pnpm test --filter smoke'
      }
    })
  })

  it('writes remote runtime workspace notes through runtime-owned storage', async () => {
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'write-1',
      ok: true,
      result: { ok: true },
      _meta: { runtimeId: 'remote-runtime' }
    })

    await writeProjectNotes(
      {
        settings: { activeRuntimeEnvironmentId: 'env-1' },
        scopeId: 'workspace-instance-1',
        connectionId: 'client-ssh-id'
      },
      'remote note'
    )

    expect(runtimeEnvironmentCall).toHaveBeenCalledWith({
      selector: 'env-1',
      method: 'projectNotes.write',
      params: { scopeId: 'workspace-instance-1', content: 'remote note' },
      timeoutMs: 15_000
    })
    expect(runtimeCall).not.toHaveBeenCalled()
  })

  it('clamps outbound note content to the persisted character limit', async () => {
    runtimeCall.mockResolvedValue({ id: 'write-1', ok: true, result: { ok: true } })

    await writeProjectNotes(localContext, 'a'.repeat(PROJECT_NOTES_MAX_CHARS + 10))

    const request = runtimeCall.mock.calls[0]?.[0]
    expect(request.params.content).toBe('a'.repeat(PROJECT_NOTES_MAX_CHARS))
  })
})
