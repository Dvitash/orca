// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ProjectNotesPanel from './ProjectNotesPanel'

const mocks = vi.hoisted(() => ({
  readProjectNotes: vi.fn(),
  writeProjectNotes: vi.fn(),
  activeWorktree: {
    id: 'wt-1',
    repoId: 'repo-1',
    path: '/home/dvita/orca/workspaces/Verde'
  },
  activeRepo: {
    id: 'repo-1',
    connectionId: null as string | null
  },
  settings: {
    activeRuntimeEnvironmentId: null as string | null
  }
}))

vi.mock('@/runtime/project-notes-client', () => ({
  readProjectNotes: mocks.readProjectNotes,
  writeProjectNotes: mocks.writeProjectNotes
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: { settings: typeof mocks.settings }) => unknown) =>
    selector({ settings: mocks.settings })
}))

vi.mock('@/store/selectors', () => ({
  useActiveWorktree: () => mocks.activeWorktree,
  useRepoById: () => mocks.activeRepo
}))

let root: Root | null = null
let container: HTMLDivElement | null = null

function getTextarea(): HTMLTextAreaElement {
  const textarea = container?.querySelector('textarea')
  if (!textarea) {
    throw new Error('Project notes textarea not found')
  }
  return textarea
}

/** Updates the controlled textarea through the native setter React tracks. */
function setNativeTextareaValue(textarea: HTMLTextAreaElement, nextValue: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  if (!valueSetter) {
    throw new Error('HTMLTextAreaElement value setter not found')
  }
  valueSetter.call(textarea, nextValue)
}

async function renderPanel(): Promise<void> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(<ProjectNotesPanel />)
  })
  await flushMicrotasks()
}

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function editTextarea(nextValue: string): Promise<void> {
  const textarea = getTextarea()
  await act(async () => {
    setNativeTextareaValue(textarea, nextValue)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function blurTextarea(): Promise<void> {
  const textarea = getTextarea()
  await act(async () => {
    textarea.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    await Promise.resolve()
  })
}

async function advanceAutosaveTimer(): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(700)
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('ProjectNotesPanel', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.useFakeTimers()
    mocks.readProjectNotes.mockReset()
    mocks.writeProjectNotes.mockReset()
    mocks.readProjectNotes.mockResolvedValue({
      content: 'existing notes',
      filePath: '/home/dvita/orca/workspaces/Verde/notes.md'
    })
    mocks.writeProjectNotes.mockResolvedValue(undefined)
    mocks.activeRepo.connectionId = null
    mocks.settings.activeRuntimeEnvironmentId = null
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    root = null
    container?.remove()
    container = null
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('renders existing project notes in the textarea', async () => {
    await renderPanel()

    expect(getTextarea().value).toBe('existing notes')
  })

  it('autosaves edits after the debounce delay', async () => {
    await renderPanel()

    await editTextarea('pnpm test --filter smoke')
    expect(mocks.writeProjectNotes).not.toHaveBeenCalled()

    await advanceAutosaveTimer()

    expect(mocks.writeProjectNotes).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: { activeRuntimeEnvironmentId: null },
        worktreeId: 'wt-1',
        worktreePath: '/home/dvita/orca/workspaces/Verde',
        connectionId: undefined
      }),
      'pnpm test --filter smoke'
    )
  })

  it('flushes edited notes on textarea blur', async () => {
    await renderPanel()

    await editTextarea('blur flush notes')
    await blurTextarea()

    expect(mocks.writeProjectNotes).toHaveBeenCalledWith(
      expect.objectContaining({
        worktreeId: 'wt-1',
        worktreePath: '/home/dvita/orca/workspaces/Verde'
      }),
      'blur flush notes'
    )
  })

  it('flushes edited notes on unmount before the debounce fires', async () => {
    await renderPanel()

    await editTextarea('unmount flush notes')
    await act(async () => {
      root?.unmount()
      root = null
      await Promise.resolve()
    })

    expect(mocks.writeProjectNotes).toHaveBeenCalledWith(
      expect.objectContaining({
        worktreeId: 'wt-1',
        worktreePath: '/home/dvita/orca/workspaces/Verde'
      }),
      'unmount flush notes'
    )
  })

  it('keeps successful autosave silent', async () => {
    await renderPanel()

    await editTextarea('updated notes')
    await advanceAutosaveTimer()

    expect(container?.textContent).not.toContain('Saved')
    expect(container?.textContent).not.toContain('Saving')
  })

  it('shows a low-key save error and preserves edited content when autosave rejects', async () => {
    mocks.writeProjectNotes.mockRejectedValue(new Error('disk full'))
    await renderPanel()

    await editTextarea('keep this draft')
    await advanceAutosaveTimer()
    await flushMicrotasks()

    expect(getTextarea().value).toBe('keep this draft')
    expect(container?.textContent).toContain('Couldn’t save notes.')
  })
})
