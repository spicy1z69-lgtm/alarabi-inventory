export type DesktopStateRow = { key: string; value: unknown }

declare global {
  interface Window {
    alarabiDesktop?: {
      isDesktop: boolean
      verifySession: (accessToken: string) => Promise<{ ok: boolean; userId?: string; reason?: string }>
      lockSession: () => Promise<{ ok: boolean }>
      readAllState: () => Promise<DesktopStateRow[]>
      writeState: (key: string, value: unknown) => Promise<{ ok: boolean }>
      printHtml: (html: string) => Promise<{ ok: boolean }>
    }
  }
}

export const isDesktopApp = (): boolean =>
  typeof window !== 'undefined' && window.alarabiDesktop?.isDesktop === true

export async function readDesktopState(): Promise<Map<string, unknown>> {
  if (!isDesktopApp()) throw new Error('Local desktop storage is not available')
  const rows = await window.alarabiDesktop!.readAllState()
  return new Map(rows.map(row => [row.key, row.value]))
}

export async function writeDesktopState(key: string, value: unknown): Promise<void> {
  if (!isDesktopApp()) throw new Error('Local desktop storage is not available')
  await window.alarabiDesktop!.writeState(key, value)
}
