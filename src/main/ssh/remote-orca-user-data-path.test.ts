import { describe, expect, it } from 'vitest'
import type { RemoteHostPlatform } from './ssh-remote-platform'
import { resolveRemoteOrcaUserDataPath } from './remote-orca-user-data-path'

const linuxHost: RemoteHostPlatform = {
  relayPlatform: 'linux-arm64',
  os: 'linux',
  arch: 'arm64',
  pathFlavor: 'posix',
  commandDialect: 'posix',
  pathSeparator: '/',
  pathDelimiter: ':'
}

const windowsHost: RemoteHostPlatform = {
  relayPlatform: 'win32-x64',
  os: 'win32',
  arch: 'x64',
  pathFlavor: 'windows',
  commandDialect: 'powershell',
  pathSeparator: '\\',
  pathDelimiter: ';'
}

describe('resolveRemoteOrcaUserDataPath', () => {
  it('matches Electron userData on Linux SSH hosts', () => {
    expect(resolveRemoteOrcaUserDataPath('/home/dvita', linuxHost)).toBe('/home/dvita/.config/orca')
  })

  it('matches Electron userData on Windows SSH hosts', () => {
    expect(resolveRemoteOrcaUserDataPath('C:/Users/dvita', windowsHost)).toBe(
      'C:/Users/dvita/AppData/Roaming/orca'
    )
  })
})
