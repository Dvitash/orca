import { describe, expect, it, vi } from 'vitest'
import { PROJECT_NOTES_MAX_CHARS } from '../../../../shared/project-notes'
import type { OrcaRuntimeService } from '../../orca-runtime'
import type { RpcRequest } from '../core'
import { RpcDispatcher } from '../dispatcher'
import { PROJECT_NOTES_METHODS } from './project-notes'

function makeRequest(method: string, params?: unknown): RpcRequest {
  return { id: 'req-1', authToken: 'tok', method, params }
}

function makeRuntime(): OrcaRuntimeService {
  return {
    getRuntimeId: () => 'test-runtime',
    readProjectNotes: vi.fn(async () => ({ content: 'notes', filePath: '/managed/notes.md' })),
    writeProjectNotes: vi.fn(async () => ({ ok: true }))
  } as unknown as OrcaRuntimeService
}

describe('project notes RPC methods', () => {
  it('reads notes by managed scope id and optional SSH connection id', async () => {
    const runtime = makeRuntime()
    const dispatcher = new RpcDispatcher({ runtime, methods: PROJECT_NOTES_METHODS })

    const response = await dispatcher.dispatch(
      makeRequest('projectNotes.read', { scopeId: ' workspace-instance-1 ', connectionId: 'ssh-1' })
    )

    expect(response).toMatchObject({ ok: true, result: { content: 'notes' } })
    expect(runtime.readProjectNotes).toHaveBeenCalledWith('workspace-instance-1', 'ssh-1')
  })

  it('clamps writes before they reach runtime storage', async () => {
    const runtime = makeRuntime()
    const dispatcher = new RpcDispatcher({ runtime, methods: PROJECT_NOTES_METHODS })

    const response = await dispatcher.dispatch(
      makeRequest('projectNotes.write', {
        scopeId: 'workspace-instance-1',
        content: 'a'.repeat(PROJECT_NOTES_MAX_CHARS + 1)
      })
    )

    expect(response).toMatchObject({ ok: true, result: { ok: true } })
    expect(runtime.writeProjectNotes).toHaveBeenCalledWith(
      'workspace-instance-1',
      'a'.repeat(PROJECT_NOTES_MAX_CHARS),
      null
    )
  })
})
