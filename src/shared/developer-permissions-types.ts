// 마이크 · 카메라 · USB · 블루투스는 앱 권한에서 뺐다(2026-11-27 사용자: 「필요없는 기능, 권한 싹다 제거해줘」).
export type DeveloperPermissionId =
  | 'screen'
  | 'accessibility'
  | 'full-disk-access'
  // macOS exposes no grant-reading API, so exclude this from DEVELOPER_PERMISSION_IDS and offer pane opening only (STA-7948).
  | 'files-and-folders'
  | 'automation'
  | 'local-network'

export type DeveloperPermissionStatus =
  | 'granted'
  | 'denied'
  | 'not-determined'
  | 'restricted'
  | 'unknown'
  | 'unsupported'
  | 'ready'

export type DeveloperPermissionState = {
  id: DeveloperPermissionId
  status: DeveloperPermissionStatus
  terminalHostStatus?: DeveloperPermissionStatus
}

export type DeveloperPermissionRequestResult = {
  id: DeveloperPermissionId
  status: DeveloperPermissionStatus
  openedSystemSettings: boolean
}

export type LocalNetworkConnectionTestFailure =
  | 'invalid-target'
  | 'timeout'
  | 'refused'
  | 'unreachable'
  | 'unresolved'
  | 'failed'
  | 'unsupported'

export type LocalNetworkConnectionTestResult = {
  ok: boolean
  host: string
  port: number
  testedAt: number
  failure?: LocalNetworkConnectionTestFailure
}
