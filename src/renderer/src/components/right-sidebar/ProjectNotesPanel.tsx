import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, JSX } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { useActiveWorktree, useRepoById } from '@/store/selectors'
import {
  readProjectNotes,
  writeProjectNotes,
  type ProjectNotesOperationContext
} from '@/runtime/project-notes-client'

const PROJECT_NOTES_SAVE_DEBOUNCE_MS = 700

type ProjectNotesFooterMessageProps = {
  message: string
  onRetry: () => void
}

/** Renders the low-emphasis project-notes failure footer. */
function ProjectNotesFooterMessage({
  message,
  onRetry
}: ProjectNotesFooterMessageProps): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>{message}</span>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="h-5 px-1.5 text-xs"
        onClick={onRetry}
      >
        {translate('auto.components.right.sidebar.ProjectNotesPanel.retry', 'Retry')}
      </Button>
    </div>
  )
}

/** Builds the notes file operation context for the active workspace. */
function useProjectNotesOperationContext(): ProjectNotesOperationContext | null {
  const activeWorktree = useActiveWorktree()
  const activeWorktreeId = activeWorktree?.id ?? null
  const activeWorktreePath = activeWorktree?.path ?? null
  const activeRepo = useRepoById(activeWorktree?.repoId ?? null)
  const settings = useAppStore((s) => s.settings)
  const notesSettings = useMemo(
    () => ({ activeRuntimeEnvironmentId: settings.activeRuntimeEnvironmentId }),
    [settings.activeRuntimeEnvironmentId]
  )

  return useMemo(() => {
    if (!activeWorktreeId || !activeWorktreePath) {
      return null
    }
    return {
      settings: notesSettings,
      worktreeId: activeWorktreeId,
      worktreePath: activeWorktreePath,
      connectionId: activeRepo?.connectionId ?? undefined
    }
  }, [activeRepo?.connectionId, activeWorktreeId, activeWorktreePath, notesSettings])
}

/** Returns a stable identity for the workspace file target that owns current notes. */
function getProjectNotesOperationKey(context: ProjectNotesOperationContext): string {
  return [
    context.worktreeId,
    context.worktreePath,
    context.connectionId ?? '',
    context.settings?.activeRuntimeEnvironmentId ?? ''
  ].join('\0')
}

/** Renders an autosaved text document backed by notes.md in the active workspace. */
export default function ProjectNotesPanel(): JSX.Element {
  const operationContext = useProjectNotesOperationContext()
  const operationKey = useMemo(
    () => (operationContext ? getProjectNotesOperationKey(operationContext) : null),
    [operationContext]
  )
  const [content, setContent] = useState('')
  const [loadError, setLoadError] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)
  const contentRef = useRef('')
  const lastSavedContentRef = useRef('')
  const editedDuringLoadRef = useRef(false)
  const operationContextRef = useRef<ProjectNotesOperationContext | null>(operationContext)
  const operationKeyRef = useRef<string | null>(operationKey)
  const mountedRef = useRef(true)
  const saveTimerRef = useRef<number | null>(null)
  const saveChainRef = useRef<Promise<void>>(Promise.resolve())

  operationContextRef.current = operationContext
  operationKeyRef.current = operationKey

  const clearDebouncedSave = useCallback((): void => {
    if (saveTimerRef.current === null) {
      return
    }
    window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = null
  }, [])

  const saveContentForContext = useCallback(
    (context: ProjectNotesOperationContext, key: string, nextContent: string): Promise<void> => {
      const saveRequest = saveChainRef.current
        .catch(() => undefined)
        .then(() => writeProjectNotes(context, nextContent))
      saveChainRef.current = saveRequest.catch(() => undefined)

      void saveRequest
        .then(() => {
          if (!mountedRef.current || operationKeyRef.current !== key) {
            return
          }
          lastSavedContentRef.current = nextContent
          if (contentRef.current === nextContent) {
            setSaveError(false)
          }
        })
        .catch(() => {
          if (!mountedRef.current || operationKeyRef.current !== key) {
            return
          }
          setSaveError(true)
        })

      return saveRequest
    },
    []
  )

  const saveCurrentContent = useCallback((): void => {
    const context = operationContextRef.current
    const key = operationKeyRef.current
    if (!context || !key) {
      return
    }
    const nextContent = contentRef.current
    if (nextContent === lastSavedContentRef.current) {
      setSaveError(false)
      return
    }
    void saveContentForContext(context, key, nextContent)
  }, [saveContentForContext])

  const scheduleSave = useCallback(
    (nextContent: string): void => {
      clearDebouncedSave()
      const context = operationContextRef.current
      const key = operationKeyRef.current
      if (!context || !key || nextContent === lastSavedContentRef.current) {
        return
      }
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null
        void saveContentForContext(context, key, contentRef.current)
      }, PROJECT_NOTES_SAVE_DEBOUNCE_MS)
    },
    [clearDebouncedSave, saveContentForContext]
  )

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    clearDebouncedSave()
    if (!operationContext || !operationKey) {
      contentRef.current = ''
      lastSavedContentRef.current = ''
      setContent('')
      setLoadError(false)
      setSaveError(false)
      return
    }

    let cancelled = false
    setLoadError(false)
    setSaveError(false)
    editedDuringLoadRef.current = false
    contentRef.current = ''
    lastSavedContentRef.current = ''
    setContent('')

    void readProjectNotes(operationContext)
      .then((document) => {
        if (cancelled || !mountedRef.current || operationKeyRef.current !== operationKey) {
          return
        }
        lastSavedContentRef.current = document.content
        if (!editedDuringLoadRef.current) {
          contentRef.current = document.content
          setContent(document.content)
        }
        setLoadError(false)
        if (editedDuringLoadRef.current) {
          scheduleSave(contentRef.current)
        }
      })
      .catch(() => {
        if (cancelled || !mountedRef.current || operationKeyRef.current !== operationKey) {
          return
        }
        lastSavedContentRef.current = ''
        if (!editedDuringLoadRef.current) {
          contentRef.current = ''
          setContent('')
        }
        setLoadError(true)
        if (editedDuringLoadRef.current) {
          scheduleSave(contentRef.current)
        }
      })

    return () => {
      cancelled = true
      clearDebouncedSave()
      const nextContent = contentRef.current
      if (nextContent !== lastSavedContentRef.current) {
        void saveContentForContext(operationContext, operationKey, nextContent)
      }
    }
  }, [
    clearDebouncedSave,
    operationContext,
    operationKey,
    reloadNonce,
    saveContentForContext,
    scheduleSave
  ])

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>): void => {
      const nextContent = event.target.value
      contentRef.current = nextContent
      editedDuringLoadRef.current = true
      setContent(nextContent)
      setSaveError(false)
      scheduleSave(nextContent)
    },
    [scheduleSave]
  )

  const handleBlur = useCallback((): void => {
    clearDebouncedSave()
    saveCurrentContent()
  }, [clearDebouncedSave, saveCurrentContent])

  const retryLoad = useCallback((): void => {
    setReloadNonce((value) => value + 1)
  }, [])

  if (!operationContext) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground">
        {translate(
          'auto.components.right.sidebar.ProjectNotesPanel.openWorkspace',
          'Open a workspace to edit project notes.'
        )}
      </div>
    )
  }

  const footerMessage = saveError
    ? translate('auto.components.right.sidebar.ProjectNotesPanel.saveError', 'Couldn’t save notes.')
    : loadError
      ? translate(
          'auto.components.right.sidebar.ProjectNotesPanel.loadError',
          'Couldn’t load notes.'
        )
      : null

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 bg-editor-surface p-3">
      <textarea
        aria-label={translate(
          'auto.components.right.sidebar.ProjectNotesPanel.projectNotesLabel',
          'Project notes'
        )}
        value={content}
        onChange={handleChange}
        onBlur={handleBlur}
        spellCheck={false}
        className="min-h-0 flex-1 resize-none border-0 bg-transparent p-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0"
      />
      <div className="min-h-5">
        {footerMessage && (
          <ProjectNotesFooterMessage
            message={footerMessage}
            onRetry={saveError ? saveCurrentContent : retryLoad}
          />
        )}
      </div>
    </div>
  )
}
