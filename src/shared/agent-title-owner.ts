import { getAgentLabel } from './agent-detection'
import type { AgentStatusEntry, AgentType } from './agent-status-types'
import {
  getSyntheticAgentTitleProfile,
  SYNTHETIC_AGENT_TITLE_PROFILES,
  type SyntheticAgentTitleProfile
} from './synthetic-agent-title'

type TitleProfileMatch = {
  profile: SyntheticAgentTitleProfile
}

const COMPATIBLE_IDLE_TITLE_RE = /(?<![\w./\\-])(?:ready|idle|done)(?![\w-])/i

function containsBrailleSpinner(title: string): boolean {
  for (const char of title) {
    const codePoint = char.codePointAt(0)
    if (codePoint !== undefined && codePoint >= 0x2800 && codePoint <= 0x28ff) {
      return true
    }
  }
  return false
}

function getProfileForTitleLabel(label: string | null): TitleProfileMatch | null {
  if (!label) {
    return null
  }
  const normalizedLabel = label.trim().toLowerCase()
  for (const profile of Object.values(SYNTHETIC_AGENT_TITLE_PROFILES)) {
    if (profile.workingLabel.toLowerCase() === normalizedLabel) {
      return { profile }
    }
  }
  return null
}

function hasPermissionSuffix(title: string, sourceProfile: SyntheticAgentTitleProfile): boolean {
  const normalizedTitle = title.trim().toLowerCase()
  return (
    normalizedTitle === sourceProfile.permissionLabel.toLowerCase() ||
    normalizedTitle.includes('action required') ||
    normalizedTitle.includes('permission') ||
    normalizedTitle.includes('waiting')
  )
}

function hasIdleSuffix(title: string, sourceProfile: SyntheticAgentTitleProfile): boolean {
  const normalizedTitle = title.trim().toLowerCase()
  return (
    normalizedTitle === sourceProfile.idleLabel.toLowerCase() ||
    COMPATIBLE_IDLE_TITLE_RE.test(title)
  )
}

export function resolveCompatibleAgentTypeForOwner(
  incomingAgentType: AgentType | null | undefined,
  ownerAgentType: AgentType | null | undefined
): AgentType | undefined {
  if (!incomingAgentType) {
    return undefined
  }
  const incomingProfile = getSyntheticAgentTitleProfile(incomingAgentType)
  const ownerProfile = getSyntheticAgentTitleProfile(ownerAgentType)
  if (
    !incomingProfile?.titleIdentityGroup ||
    !ownerProfile?.titleIdentityGroup ||
    incomingProfile.titleIdentityGroup !== ownerProfile.titleIdentityGroup
  ) {
    return incomingAgentType
  }
  return ownerAgentType as AgentType
}

export function normalizeCompatibleAgentTitleForOwner(
  title: string,
  ownerAgentType: AgentType | null | undefined
): string {
  const ownerProfile = getSyntheticAgentTitleProfile(ownerAgentType)
  if (!ownerProfile?.titleIdentityGroup) {
    return title
  }
  const source = getProfileForTitleLabel(getAgentLabel(title))
  if (
    !source?.profile.titleIdentityGroup ||
    source.profile.titleIdentityGroup !== ownerProfile.titleIdentityGroup
  ) {
    return title
  }
  if (containsBrailleSpinner(title)) {
    return `\u280b ${ownerProfile.workingLabel}`
  }
  if (hasPermissionSuffix(title, source.profile)) {
    return ownerProfile.permissionLabel
  }
  if (hasIdleSuffix(title, source.profile)) {
    return ownerProfile.idleLabel
  }
  return ownerProfile.workingLabel
}

export function normalizeCompatibleAgentStatusEntryForOwner(
  entry: AgentStatusEntry,
  ownerAgentType: AgentType | null | undefined
): AgentStatusEntry {
  const agentType = resolveCompatibleAgentTypeForOwner(entry.agentType, ownerAgentType)
  const terminalTitle = entry.terminalTitle
    ? normalizeCompatibleAgentTitleForOwner(entry.terminalTitle, agentType ?? ownerAgentType)
    : entry.terminalTitle
  if (agentType === entry.agentType && terminalTitle === entry.terminalTitle) {
    return entry
  }
  return {
    ...entry,
    ...(agentType ? { agentType } : {}),
    ...(terminalTitle ? { terminalTitle } : {})
  }
}
