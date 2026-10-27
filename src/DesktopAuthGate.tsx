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
      if (!active) return
      if (event === 'PASSWORD_RECOVERY') setMode('recovery')
      if (event === 'SIGNED_OUT') {
        setUnlocked(false)
        if (desktop && window.alarabiDesktop) {
          void window.alarabiDesktop.lockSession().catch(() => {
            setError('تم تسجيل الخروج، لكن تعذر تأكيد قفل التخزين المحلي. أغلق التطبيق وافتحه مرة أخرى.')
          })
        }
      }
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

  const resendConfirmation = async () => {
    setError('')
    setNotice('')
    const normalizedEmail = email.trim()
    if (!normalizedEmail) {
      setError('اكتب بريدك الإلكتروني أولًا لإعادة إرسال رسالة التأكيد.')
      return
    }
    setBusy(true)
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: normalizedEmail })
      if (error) throw error
      setNotice('لو الحساب محتاج تأكيد، أعدنا طلب إرسال الرسالة. راجع Inbox وSpam، وتأكد من صحة البريد الإلكتروني.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر طلب رسالة التأكيد. حاول مرة أخرى بعد قليل.')
    } finally {
      setBusy(false)
    }
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

  return <main style={styles.page} dir="rtl"><section style={styles.card}>
    <div style={styles.accent} />
    <header style={styles.brandHeader}>
      <div style={styles.logo}>ع</div>
      <div style={styles.brandCopy}>
        <div style={styles.eyebrow}>AL ARABI INVENTORY</div>
        <h1 style={styles.heading}>العربي</h1>
        <p style={styles.brandSubtitle}>لأنظمة التأريض والحماية من الصواعق</p>
      </div>
    </header>
    <div style={styles.sectionHead}>
      <div style={styles.secureMark}>✓</div>
      <div><h2 style={styles.subheading}>{title}</h2><p style={styles.description}>{ready ? description : 'جاري الاتصال بخدمة الحسابات الآمنة…'}</p></div>
    </div>
    {!ready ? <p role="status" style={styles.notice}>لحظة واحدة…</p> : <form onSubmit={submit}>
      {mode === 'signup' && <><label style={styles.label}>اسم المستخدم</label><input style={styles.input} autoComplete="nickname" value={username} onChange={e=>setUsername(e.target.value)} required minLength={3} maxLength={40} placeholder="اسم يظهر في حسابك" /></>}
      {mode !== 'recovery' && <><label style={styles.label}>{mode === 'login' ? 'البريد الإلكتروني (اسم الدخول)' : 'البريد الإلكتروني'}</label><input style={styles.input} type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required maxLength={254} placeholder="name@example.com" /></>}
      {mode !== 'forgot' && <><label style={styles.label}>{mode === 'recovery' ? 'كلمة المرور الجديدة' : 'كلمة المرور'}</label><input style={styles.input} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e=>setPassword(e.target.value)} required minLength={8} maxLength={256} placeholder="8 أحرف على الأقل" /></>}
      {(mode === 'signup' || mode === 'recovery') && <><label style={styles.label}>تأكيد كلمة المرور</label><input style={styles.input} type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} required minLength={8} maxLength={256} /></>}
      {error && <p role="alert" style={styles.error}>{error}</p>}{notice && <p role="status" style={styles.notice}>{notice}</p>}
      <button disabled={busy} style={{...styles.submit, opacity:busy ? .72 : 1, cursor:busy ? 'wait' : 'pointer'}}>{busy ? 'لحظة واحدة…' : mode === 'signup' ? 'إنشاء الحساب' : mode === 'forgot' ? 'إرسال رابط الاستعادة' : mode === 'recovery' ? 'حفظ كلمة المرور' : 'تسجيل الدخول'} <span aria-hidden="true">←</span></button>
      <div style={styles.links}>
        {mode === 'login' && <><button type="button" style={styles.link} onClick={()=>{setMode('forgot');setError('');setNotice('')}}>نسيت كلمة المرور؟</button><button type="button" style={styles.link} onClick={()=>{setMode('signup');setError('');setNotice('')}}>إنشاء حساب جديد</button><button type="button" disabled={busy} style={styles.link} onClick={()=>void resendConfirmation()}>{busy ? 'لحظة واحدة…' : 'إعادة إرسال رسالة التأكيد'}</button></>}
        {(mode === 'signup' || mode === 'forgot' || mode === 'recovery') && <button type="button" style={styles.link} onClick={()=>{setMode('login');setError('');setNotice('')}}>العودة لتسجيل الدخول</button>}
      </div>
      <div style={styles.footerRule} />
      <p style={styles.foot}><span style={styles.lockDot}>●</span> الحسابات محمية. لا تشارك كلمة المرور مع أي شخص.</p>
    </form>}
  </section></main>
}

const styles = {
  page: { boxSizing:'border-box', minHeight:'100vh', display:'grid', placeItems:'center', padding:'32px 18px', background:'radial-gradient(ellipse at top right, #e2ebf2 0%, #eef2f5 48%, #e8edf1 100%)', fontFamily:'Tahoma, Arial, sans-serif' } as const,
  card: { boxSizing:'border-box', position:'relative', overflow:'hidden', width:'100%', maxWidth:510, padding:'34px 38px 27px', borderRadius:16, background:'#fff', boxShadow:'0 22px 65px rgba(23,54,83,.14)', border:'1px solid #d9e2e9' } as const,
  accent: { position:'absolute', top:0, right:0, left:0, height:6, background:'linear-gradient(90deg,#173653 0%,#245b80 72%,#c6a66b 100%)' } as const,
  brandHeader: { display:'flex', alignItems:'center', justifyContent:'center', gap:17, padding:'5px 0 25px', borderBottom:'1px solid #e3e9ee' } as const,
  logo: { flexShrink:0, width:66, height:66, display:'grid', placeItems:'center', borderRadius:12, background:'linear-gradient(145deg,#173653,#245b80)', border:'1px solid #c6a66b', boxShadow:'0 5px 15px rgba(23,54,83,.18)', color:'#fff', fontSize:32, fontWeight:900 } as const,
  brandCopy: { textAlign:'right' } as const,
  eyebrow: { fontSize:10, letterSpacing:2, color:'#9b7b42', fontWeight:800, marginBottom:3 } as const,
  heading: { margin:'0 0 2px', fontSize:27, lineHeight:1.25, color:'#173653', fontWeight:900 } as const,
  brandSubtitle: { margin:0, fontSize:12, color:'#647787', lineHeight:1.8 } as const,
  sectionHead: { display:'flex', alignItems:'flex-start', gap:12, margin:'25px 0 17px' } as const,
  secureMark: { flexShrink:0, width:34, height:34, display:'grid', placeItems:'center', borderRadius:9, background:'#eef4f8', border:'1px solid #d9e5ec', color:'#245b80', fontSize:18, fontWeight:900 } as const,
  subheading: { margin:'0 0 5px', fontSize:20, color:'#173653', fontWeight:800 } as const,
  description: { margin:0, color:'#647787', fontSize:13, lineHeight:1.8 } as const,
  label: { display:'block', margin:'15px 0 7px', fontWeight:700, fontSize:13, color:'#253746' } as const,
  input: { boxSizing:'border-box', display:'block', width:'100%', border:'1px solid #d4dfe7', borderRadius:8, padding:'13px 14px', background:'#fbfcfd', color:'#253746', fontSize:14, outlineColor:'#245b80' } as const,
  submit: { display:'flex', alignItems:'center', justifyContent:'center', gap:10, width:'100%', marginTop:23, border:'1px solid #173653', borderRadius:8, padding:'14px 16px', background:'linear-gradient(110deg,#173653,#245b80)', color:'#fff', fontWeight:800, fontSize:15, cursor:'pointer', boxShadow:'0 5px 12px rgba(23,54,83,.15)' } as const,
  links: { display:'flex', justifyContent:'center', flexWrap:'wrap', gap:'7px 15px', marginTop:16, fontSize:12 } as const,
  link: { border:0, background:'transparent', color:'#245b80', cursor:'pointer', padding:'5px 2px', fontWeight:700, fontSize:12 } as const,
  error: { color:'#9e302a', background:'#fff3f1', border:'1px solid #f1d2ce', padding:12, borderRadius:8, margin:'16px 0 0', lineHeight:1.7, fontSize:13 } as const,
  notice: { color:'#245b80', background:'#eef4f8', border:'1px solid #d9e5ec', padding:12, borderRadius:8, margin:'16px 0 0', lineHeight:1.7, fontSize:13 } as const,
  footerRule: { height:1, background:'#e7edf1', marginTop:22 } as const,
  lockDot: { color:'#c6a66b', fontSize:10, marginLeft:5 } as const,
  foot: { textAlign:'center', fontSize:11, color:'#718391', lineHeight:1.8, margin:'13px 0 0' } as const,
}
