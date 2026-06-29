import { joinRemotePath, type RemoteHostPlatform } from './ssh-remote-platform'

/** Resolves Orca's app-data directory on an SSH host from the detected platform. */
export function resolveRemoteOrcaUserDataPath(
  remoteHome: string,
  hostPlatform: RemoteHostPlatform
): string {
  if (hostPlatform.os === 'darwin') {
    return joinRemotePath(hostPlatform, remoteHome, 'Library', 'Application Support', 'orca')
  }
  if (hostPlatform.os === 'win32') {
    return joinRemotePath(hostPlatform, remoteHome, 'AppData', 'Roaming', 'orca')
  }
  return joinRemotePath(hostPlatform, remoteHome, '.config', 'orca')
}
