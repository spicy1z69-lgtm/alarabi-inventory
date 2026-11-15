export type DesktopStateRow = { key: string; value: unknown }

declare global {
  interface Window {
    alarabiDesktop?: {
      isDesktop: boolean
      verifySession: (accessToken: string) => Promise<{ ok: boolean; userId?: string; reason?: string }>
      lockSession: () => Promise<{ ok: boolean }>
      localAuthStatus: () => Promise<{ hasUser: boolean; session: { ownerId: string; username: string } | null }>
      localSignUp: (username: string, password: string) => Promise<{ ok: boolean; session: { ownerId: string; username: string }; recoveryKey: string }>
      localLogin: (username: string, password: string) => Promise<{ ok: boolean; session: { ownerId: string; username: string }; recoveryKey?: string }>
      localResetPassword: (username: string, recoveryKey: string, newPassword: string) => Promise<{ ok: boolean; recoveryKey: string }>
      localSession: () => Promise<{ ownerId: string; username: string } | null>
      localLogout: () => Promise<{ ok: boolean }>
      readAllState: () => Promise<DesktopStateRow[]>
      writeState: (key: string, value: unknown) => Promise<{ ok: boolean }>
      writeStateBundle: (records: Array<{ key: string; value: unknown }>) => Promise<{ ok: boolean; count: number }>
      writeStateBundleSync: (records: Array<{ key: string; value: unknown }>) => { ok: boolean; count?: number; error?: string }
      printHtml: (html: string) => Promise<{ ok: boolean }>
      printPreview: () => Promise<{ ok: boolean; cancelled?: boolean }>
      savePreviewPdf: () => Promise<{ ok: boolean; savedAsPdf?: boolean; cancelled?: boolean; filePath?: string }>
      onQuickSearchShortcut: (callback: () => void) => () => void
    }
  }
}

export const isDesktopApp = (): boolean =>
  typeof window !== 'undefined' && window.alarabiDesktop?.isDesktop === true

export async function getDesktopLocalSession(): Promise<{ ownerId: string; username: string } | null> {
  if (!isDesktopApp()) return null
  return window.alarabiDesktop!.localSession()
}

export async function readDesktopState(): Promise<Map<string, unknown>> {
  if (!isDesktopApp()) throw new Error('Local desktop storage is not available')
  const rows = await window.alarabiDesktop!.readAllState()
  return new Map(rows.map(row => [row.key, row.value]))
}

export async function writeDesktopState(key: string, value: unknown): Promise<void> {
  if (!isDesktopApp()) throw new Error('Local desktop storage is not available')
  await window.alarabiDesktop!.writeState(key, value)
}

let pendingBundleWrite: Promise<void> = Promise.resolve()

export async function writeDesktopStateBundle(records: Array<{ key: string; value: unknown }>): Promise<void> {
  if (!isDesktopApp()) throw new Error('Local desktop storage is not available')
  const write = pendingBundleWrite.catch(() => undefined).then(async () => {
    await window.alarabiDesktop!.writeStateBundle(records)
  })
  pendingBundleWrite = write
  await write
}
