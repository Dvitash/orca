import { z } from 'zod'
import { defineMethod, type RpcAnyMethod } from '../core'
import { normalizeProjectNotesContent } from '../../../../shared/project-notes'

const ProjectNotesBaseParams = z.object({
  scopeId: z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value.trim() : ''))
    .pipe(z.string().min(1, 'Missing scopeId')),
  connectionId: z
    .unknown()
    .transform((value) =>
      typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
    )
    .optional()
})

const ProjectNotesWriteParams = ProjectNotesBaseParams.extend({
  content: z
    .unknown()
    .transform((value) => (typeof value === 'string' ? normalizeProjectNotesContent(value) : null))
    .pipe(z.string())
})

// Why: project notes must live in Orca-managed app data on the host that owns
// the project, not inside the user-visible repo/worktree root.
export const PROJECT_NOTES_METHODS: readonly RpcAnyMethod[] = [
  defineMethod({
    name: 'projectNotes.read',
    params: ProjectNotesBaseParams,
    handler: async (params, { runtime }) =>
      runtime.readProjectNotes(params.scopeId, params.connectionId ?? null)
  }),
  defineMethod({
    name: 'projectNotes.write',
    params: ProjectNotesWriteParams,
    handler: async (params, { runtime }) =>
      runtime.writeProjectNotes(params.scopeId, params.content, params.connectionId ?? null)
  })
]
