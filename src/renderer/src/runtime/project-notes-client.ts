import type { GlobalSettings } from '../../../shared/types'
import {
  normalizeProjectNotesContent,
  type ProjectNotesDocument
} from '../../../shared/project-notes'
import { callRuntimeRpc, getActiveRuntimeTarget } from './runtime-rpc-client'

const PROJECT_NOTES_RPC_TIMEOUT_MS = 15_000

export type ProjectNotesOperationContext = {
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
  scopeId: string
  connectionId?: string
}

/** Reads the active workspace notes document from Orca-managed runtime storage. */
export async function readProjectNotes(
  context: ProjectNotesOperationContext
): Promise<ProjectNotesDocument> {
  return callRuntimeRpc<ProjectNotesDocument>(
    getActiveRuntimeTarget(context.settings),
    'projectNotes.read',
    getProjectNotesRpcParams(context),
    { timeoutMs: PROJECT_NOTES_RPC_TIMEOUT_MS }
  )
}

/** Writes the active workspace notes document to Orca-managed runtime storage. */
export async function writeProjectNotes(
  context: ProjectNotesOperationContext,
  content: string
): Promise<void> {
  await callRuntimeRpc(
    getActiveRuntimeTarget(context.settings),
    'projectNotes.write',
    { ...getProjectNotesRpcParams(context), content: normalizeProjectNotesContent(content) },
    { timeoutMs: PROJECT_NOTES_RPC_TIMEOUT_MS }
  )
}

/** Builds notes RPC params while keeping client-only SSH ids out of remote runtimes. */
function getProjectNotesRpcParams(context: ProjectNotesOperationContext): {
  scopeId: string
  connectionId?: string
} {
  const target = getActiveRuntimeTarget(context.settings)
  if (target.kind === 'environment') {
    return { scopeId: context.scopeId }
  }
  return {
    scopeId: context.scopeId,
    ...(context.connectionId ? { connectionId: context.connectionId } : {})
  }
}
