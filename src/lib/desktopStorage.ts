export type DesktopStateRow = { key: string; value: unknown }

declare global {
  interface Window {
    alarabiDesktop?: {
      isDesktop: boolean
      verifySession: (accessToken: string) => Promise<{ ok: boolean; userId?: string; reason?: string }>
      lockSession: () => Promise<{ ok: boolean }>
      localAuthStatus: () => Promise<{ hasUser: boolean; session: { ownerId: string; username: string } | null }>
      localSignUp: (username: string, password: string) => Promise<{ ok: boolean; session: { ownerId: string; username: string } }>
      localLogin: (username: string, password: string) => Promise<{ ok: boolean; session: { ownerId: string; username: string } }>
      localSession: () => Promise<{ ownerId: string; username: string } | null>
      localLogout: () => Promise<{ ok: boolean }>
      readAllState: () => Promise<DesktopStateRow[]>
      writeState: (key: string, value: unknown) => Promise<{ ok: boolean }>
      printHtml: (html: string) => Promise<{ ok: boolean }>
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
