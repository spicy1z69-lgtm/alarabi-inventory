import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { supabase } from './lib/supabase'
import { isDesktopApp } from './lib/desktopStorage'

type Mode = 'login' | 'signup' | 'forgot' | 'recovery'
const RECOVERY_SITE_URL = 'https://alarabi-inventory.vercel.app'

export default function DesktopAuthGate({ children }: { children: ReactNode }) {
  const desktop = isDesktopApp()
  const [mode, setMode] = useState<Mode>('login')
  const [ready, setReady] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    const { data: listener } = supabase.auth.onAuthStateChange(event => {
      if (active && event === 'PASSWORD_RECOVERY') setMode('recovery')
    })
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (!active) return
        const recovery = window.location.hash.includes('type=recovery') ||
          new URLSearchParams(window.location.search).get('type') === 'recovery'
        if (recovery) setMode('recovery')
        else if (data.session && !desktop) setUnlocked(true)
        else if (data.session && desktop) {
          const result = await window.alarabiDesktop!.verifySession(data.session.access_token)
          if (active && result.ok) setUnlocked(true)
          else await supabase.auth.signOut()
        }
      } catch {
        if (active) setError('تعذر الاتصال بخدمة الحسابات. تأكد من الإنترنت وحاول مرة أخرى.')
      } finally {
        if (active) setReady(true)
      }
    })()
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [desktop])

  const verify = async (token: string) => {
    if (!desktop) return
    const result = await window.alarabiDesktop!.verifySession(token)
    if (!result.ok) throw new Error('تعذر التحقق من الحساب على الكمبيوتر. تأكد من الإنترنت وحاول مرة أخرى.')
  }

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setError(''); setNotice('')
    if (busy) return
    if ((mode === 'signup' || mode === 'recovery') && password !== confirm) {
      setError('كلمتا المرور غير متطابقتين.'); return
    }
    if ((mode === 'signup' || mode === 'recovery') && password.length < 8) {
      setError('كلمة المرور لازم تكون 8 أحرف على الأقل.'); return
    }
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password, options: { data: { username: username.trim() } },
        })
        if (error) throw error
        if (data.session) { await verify(data.session.access_token); setUnlocked(true) }
        else { setMode('login'); setNotice('تم إنشاء الحساب. افتح رسالة التأكيد في بريدك الإلكتروني، ثم سجّل الدخول.') }
      } else if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
        if (!data.session) throw new Error('لم يتم إنشاء جلسة دخول. حاول مرة أخرى.')
        await verify(data.session.access_token); setUnlocked(true)
      } else if (mode === 'forgot') {
        const redirectTo = desktop ? RECOVERY_SITE_URL : window.location.origin
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
        if (error) throw error
        setNotice('لو البريد مسجّل، هتوصلك رسالة فيها رابط تغيير كلمة المرور. راجع البريد والرسائل غير المرغوب فيها.')
      } else {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        await supabase.auth.signOut()
        setPassword(''); setConfirm(''); setMode('login')
        setNotice('تم تغيير كلمة المرور بنجاح. سجّل الدخول بكلمة المرور الجديدة.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حصل خطأ. حاول مرة أخرى.')
    } finally { setBusy(false) }
  }

  if (unlocked) return <>{children}</>
  const title = mode === 'signup' ? 'إنشاء حساب جديد' : mode === 'forgot' ? 'استعادة كلمة المرور' : mode === 'recovery' ? 'كلمة مرور جديدة' : 'تسجيل الدخول'
  const description = mode === 'signup' ? 'أنشئ حسابًا أونلاين خاصًا بك. البريد الإلكتروني مطلوب لاستعادة الحساب.' : mode === 'forgot' ? 'اكتب بريدك الإلكتروني لنرسل رابط استعادة كلمة المرور.' : mode === 'recovery' ? 'اكتب كلمة المرور الجديدة لحسابك.' : 'سجّل الدخول بحسابك لفتح نظام جرد العربي.'

  return <main style={styles.page}><section style={styles.card}>
    <div style={styles.logo}>ع</div>
    <h1 style={styles.heading}>نظام جرد العربي</h1><h2 style={styles.subheading}>{title}</h2>
    <p style={styles.description}>{ready ? description : 'جاري الاتصال بخدمة الحسابات الآمنة…'}</p>
    {!ready ? <p role="status">لحظة واحدة…</p> : <form onSubmit={submit}>
      {mode === 'signup' && <><label style={styles.label}>اسم المستخدم</label><input style={styles.input} autoComplete="nickname" value={username} onChange={e=>setUsername(e.target.value)} required minLength={3} maxLength={40} placeholder="اسم يظهر في حسابك" /></>}
      {mode !== 'recovery' && <><label style={styles.label}>{mode === 'login' ? 'البريد الإلكتروني (اسم الدخول)' : 'البريد الإلكتروني'}</label><input style={styles.input} type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required maxLength={254} placeholder="name@example.com" /></>}
      {mode !== 'forgot' && <><label style={styles.label}>{mode === 'recovery' ? 'كلمة المرور الجديدة' : 'كلمة المرور'}</label><input style={styles.input} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e=>setPassword(e.target.value)} required minLength={8} maxLength={256} placeholder="8 أحرف على الأقل" /></>}
      {(mode === 'signup' || mode === 'recovery') && <><label style={styles.label}>تأكيد كلمة المرور</label><input style={styles.input} type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} required minLength={8} maxLength={256} /></>}
      {error && <p role="alert" style={styles.error}>{error}</p>}{notice && <p role="status" style={styles.notice}>{notice}</p>}
      <button disabled={busy} style={styles.submit}>{busy ? 'لحظة واحدة…' : mode === 'signup' ? 'إنشاء الحساب' : mode === 'forgot' ? 'إرسال رابط الاستعادة' : mode === 'recovery' ? 'حفظ كلمة المرور' : 'تسجيل الدخول'}</button>
      <div style={styles.links}>
        {mode === 'login' && <><button type="button" style={styles.link} onClick={()=>{setMode('forgot');setError('');setNotice('')}}>نسيت كلمة المرور؟</button><button type="button" style={styles.link} onClick={()=>{setMode('signup');setError('');setNotice('')}}>إنشاء حساب جديد</button></>}
        {(mode === 'signup' || mode === 'forgot') && <button type="button" style={styles.link} onClick={()=>{setMode('login');setError('');setNotice('')}}>العودة لتسجيل الدخول</button>}
      </div>
      <p style={styles.foot}>الحسابات محفوظة عبر خدمة أونلاين آمنة. لا تشارك كلمة المرور مع أي شخص.</p>
    </form>}
  </section></main>
}

const styles = {
  page: { minHeight:'100vh', display:'grid', placeItems:'center', padding:24, background:'linear-gradient(135deg, #edf3fb, #f8fafc)' } as const,
  card: { boxSizing:'border-box', width:'100%', maxWidth:440, padding:32, borderRadius:22, background:'#fff', boxShadow:'0 24px 70px rgba(20,34,56,.13)', border:'1px solid #e4eaf2' } as const,
  logo: { width:60, height:60, margin:'0 auto 18px', display:'grid', placeItems:'center', borderRadius:18, background:'#142238', color:'#fff', fontSize:28, fontWeight:800 } as const,
  heading: { textAlign:'center', margin:'0 0 8px', fontSize:25, color:'#142238' } as const,
  subheading: { textAlign:'center', margin:'0 0 10px', fontSize:18, color:'#2463eb' } as const,
  description: { textAlign:'center', color:'#66758a', margin:'0 0 24px', lineHeight:1.8 } as const,
  label: { display:'block', margin:'14px 0 7px', fontWeight:700, color:'#26354a' } as const,
  input: { boxSizing:'border-box', width:'100%', border:'1px solid #d7deea', borderRadius:10, padding:'12px 13px', background:'#fff', color:'#182338' } as const,
  submit: { width:'100%', marginTop:22, border:0, borderRadius:12, padding:'13px 16px', background:'#2463eb', color:'#fff', fontWeight:800, fontSize:16, cursor:'pointer' } as const,
  links: { display:'flex', justifyContent:'center', flexWrap:'wrap', gap:14, marginTop:18, fontSize:13 } as const,
  link: { border:0, background:'transparent', color:'#2463eb', cursor:'pointer', padding:4, fontWeight:700 } as const,
  error: { color:'#b42318', background:'#fff0ee', padding:12, borderRadius:10, margin:'16px 0 0', lineHeight:1.7 } as const,
  notice: { color:'#176b43', background:'#ecfdf3', padding:12, borderRadius:10, margin:'16px 0 0', lineHeight:1.7 } as const,
  foot: { textAlign:'center', fontSize:12, color:'#778398', lineHeight:1.8, margin:'18px 0 0' } as const,
}
