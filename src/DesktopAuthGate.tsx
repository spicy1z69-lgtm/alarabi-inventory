import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { isDesktopApp } from './lib/desktopStorage'

type AuthStatus = { configured: boolean; username: string }
type Props = { children: ReactNode }

export default function DesktopAuthGate({ children }: Props) {
  const desktop = isDesktopApp()
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [unlocked, setUnlocked] = useState(false)

  useEffect(() => {
    if (!desktop) return
    window.alarabiDesktop!.authStatus()
      .then(setStatus)
      .catch(() => setError('تعذر التحقق من إعدادات تسجيل الدخول. اقفل البرنامج وافتحه مرة أخرى.'))
  }, [desktop])

  if (!desktop) return <>{children}</>
  if (unlocked) return <>{children}</>

  const setupMode = status !== null && !status.configured
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (busy) return
    if (setupMode && password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين.')
      return
    }
    setBusy(true)
    try {
      if (setupMode) {
        await window.alarabiDesktop!.authSetup(username, password)
      } else {
        const result = await window.alarabiDesktop!.authLogin(username, password)
        if (!result.ok) {
          setError('اسم المستخدم أو كلمة المرور غير صحيحة.')
          return
        }
      }
      setUnlocked(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'حصل خطأ. حاول مرة أخرى.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: 'linear-gradient(135deg, #edf3fb, #f8fafc)' }}>
      <section style={{ width: '100%', maxWidth: 430, padding: 32, borderRadius: 22, background: '#fff', boxShadow: '0 24px 70px rgba(20,34,56,.13)', border: '1px solid #e4eaf2' }}>
        <div style={{ width: 60, height: 60, margin: '0 auto 18px', display: 'grid', placeItems: 'center', borderRadius: 18, background: '#142238', color: '#fff', fontSize: 28, fontWeight: 800 }}>ع</div>
        <h1 style={{ textAlign: 'center', margin: '0 0 8px', fontSize: 25, color: '#142238' }}>نظام جرد العربي</h1>
        <p style={{ textAlign: 'center', color: '#66758a', margin: '0 0 26px', lineHeight: 1.8 }}>
          {status === null ? 'جاري التحقق من إعدادات الأمان…' : setupMode ? 'أنشئ اسم مستخدم وكلمة مرور خاصة بالمحل. ستحتاجهما كل مرة تفتح فيها البرنامج.' : 'سجّل الدخول لفتح بيانات المحل.'}
        </p>
        {status === null ? null : (
          <form onSubmit={submit}>
            <label style={{ display: 'block', marginBottom: 7, fontWeight: 700 }}>اسم المستخدم</label>
            <input autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} required minLength={3} maxLength={40} pattern="[a-zA-Z0-9._-]+" placeholder="مثال: alarabi" style={fieldStyle} />
            <label style={{ display: 'block', margin: '16px 0 7px', fontWeight: 700 }}>كلمة المرور</label>
            <input type="password" autoComplete={setupMode ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} required minLength={8} maxLength={256} placeholder="8 أحرف على الأقل" style={fieldStyle} />
            {setupMode && <>
              <label style={{ display: 'block', margin: '16px 0 7px', fontWeight: 700 }}>تأكيد كلمة المرور</label>
              <input type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required minLength={8} maxLength={256} placeholder="اكتب كلمة المرور مرة أخرى" style={fieldStyle} />
            </>}
            {error && <p role="alert" style={{ color: '#b42318', background: '#fff0ee', padding: 12, borderRadius: 10, margin: '16px 0 0' }}>{error}</p>}
            <button type="submit" disabled={busy} style={{ width: '100%', marginTop: 22, border: 0, borderRadius: 12, padding: '13px 16px', background: '#2463eb', color: '#fff', fontWeight: 800, fontSize: 16 }}>
              {busy ? 'لحظة واحدة…' : setupMode ? 'إنشاء حساب المحل' : 'تسجيل الدخول'}
            </button>
            <p style={{ textAlign: 'center', fontSize: 12, color: '#778398', lineHeight: 1.8, margin: '16px 0 0' }}>بيانات الدخول محفوظة محليًا على هذا الكمبيوتر، وكلمة المرور لا تُحفظ كنص مكشوف.</p>
          </form>
        )}
      </section>
    </main>
  )
}

const fieldStyle: CSSProperties = {
  width: '100%',
  border: '1px solid #d7deea',
  borderRadius: 10,
  padding: '12px 13px',
  background: '#fff',
  color: '#182338',
  outlineOffset: 2,
}
