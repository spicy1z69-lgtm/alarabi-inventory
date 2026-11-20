import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { ShieldCheck } from 'lucide-react'
import { supabase } from './lib/supabase'
import { isDesktopApp } from './lib/desktopStorage'

type Mode = 'login' | 'signup' | 'forgot' | 'recovery'
const RECOVERY_SITE_URL = 'https://alarabi-inventory.vercel.app'

function CloudAuthGate({ children }: { children: ReactNode }) {
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
      <div style={styles.brandCopy}>
        <div style={styles.eyebrow}>alarabisystem</div>
        <h1 style={styles.heading}>مؤسسة العربي</h1>
        <p style={styles.brandSubtitle}>لأنظمة التأريض والحماية من الصواعق</p>
      </div>
    </header>
    <div style={styles.sectionHead}>
      <div style={styles.secureMark}><ShieldCheck size={19} aria-hidden="true" /></div>
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


function LocalDesktopAuthGate({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<'login' | 'reset'>('login')
  const [ready, setReady] = useState(false)
  const [hasUser, setHasUser] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [newRecoveryKey, setNewRecoveryKey] = useState('')
  const [unlockAfterKeySave, setUnlockAfterKeySave] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    void window.alarabiDesktop!.localAuthStatus().then(result => {
      if (!active) return
      setHasUser(result.hasUser)
      setUnlocked(Boolean(result.session))
      setUsername(result.session?.username || '')
    }).catch(() => {
      if (active) setError('تعذر فتح قاعدة البيانات المحلية. أغلق البرنامج وافتحه مرة أخرى.')
    }).finally(() => { if (active) setReady(true) })
    return () => { active = false }
  }, [])

  const setup = !hasUser
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (busy) return
    if (setup && (password.length < 10 || password !== confirm)) { setError(password.length < 10 ? 'كلمة المرور لازم تكون 10 أحرف على الأقل.' : 'كلمتا المرور غير متطابقتين.'); return }
    if (mode === 'reset' && (!username.trim() || !recoveryCode.trim() || password.length < 10 || password !== confirm)) {
      setError('اكتب اسم المستخدم ورمز الاستعادة، وكلمة مرور جديدة من 10 أحرف على الأقل مع تأكيدها.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'reset' && !setup) {
        const result = await window.alarabiDesktop!.localResetPassword(username, recoveryCode, password)
        setNewRecoveryKey(result.recoveryKey)
        setUnlockAfterKeySave(false)
        setPassword(''); setConfirm(''); setRecoveryCode('')
        return
      }
      let result: { ok: boolean; session: { ownerId: string; username: string } }
      let generatedRecoveryKey: string | undefined
      if (setup) {
        const signup = await window.alarabiDesktop!.localSignUp(username, password)
        result = signup
        generatedRecoveryKey = signup.recoveryKey
      } else {
        const login = await window.alarabiDesktop!.localLogin(username, password)
        result = login
        generatedRecoveryKey = login.recoveryKey
      }
      setHasUser(true)
      setUnlocked(Boolean(result.ok))
      setUsername(result.session.username)
      setPassword('')
      setConfirm('')
      if (generatedRecoveryKey) {
        setNewRecoveryKey(generatedRecoveryKey)
        setUnlockAfterKeySave(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول. راجع البيانات وحاول مرة أخرى.')
    } finally { setBusy(false) }
  }

  if (newRecoveryKey) return <main style={styles.page} dir="rtl"><section style={styles.card}>
    <div style={styles.accent} /><header style={styles.brandHeader}><div style={styles.brandCopy}><div style={styles.eyebrow}>alarabisystem · استعادة الحساب</div><h1 style={styles.heading}>احفظ رمز الاستعادة</h1></div></header>
    <p style={styles.description}>احتفظ بالرمز في مكان آمن خارج الكمبيوتر. يُستخدم لتعيين كلمة مرور جديدة إذا نسيتها. لا يمكن للدعم استرجاع الرمز بعد إغلاق هذه الشاشة.</p>
    <div dir="ltr" style={{...styles.input, height:'auto', textAlign:'center', fontSize:19, fontWeight:900, letterSpacing:1.5, wordBreak:'break-word'}}>{newRecoveryKey}</div>
    <p style={styles.notice}>رمز الاستعادة سري، ويمنح حامله القدرة على تغيير كلمة مرور هذا الحساب.</p>
    <button type="button" style={styles.submit} onClick={()=>{setNewRecoveryKey('');setError('');if(unlockAfterKeySave)setUnlocked(true);else{setMode('login');setPassword('');setConfirm('')}}}>حفظت الرمز — متابعة</button>
  </section></main>
  if (unlocked) return <>{children}</>
  return <main style={styles.page} dir="rtl"><section style={styles.card}>
    <div style={styles.accent} />
    <header style={styles.brandHeader}><div style={styles.brandCopy}><div style={styles.eyebrow}>alarabisystem · إصدار الكمبيوتر</div><h1 style={styles.heading}>مؤسسة العربي</h1><p style={styles.brandSubtitle}>حساب محلي للنسخة المكتبية — لا يحتاج بريدًا أو إنترنت</p></div></header>
    <div style={styles.sectionHead}><div style={styles.secureMark}><ShieldCheck size={19} aria-hidden="true" /></div><div><h2 style={styles.subheading}>{setup ? 'إنشاء الحساب المحلي الأول' : mode === 'reset' ? 'استعادة الحساب' : 'تسجيل الدخول'}</h2><p style={styles.description}>{ready ? (setup ? 'أنشئ اسم مستخدم وكلمة مرور لحماية بيانات هذا الكمبيوتر.' : mode === 'reset' ? 'أدخل رمز الاستعادة الذي حفظته عند إنشاء الحساب لتعيين كلمة مرور جديدة.' : 'أدخل بيانات الحساب المحلي لفتح المخزون والفواتير.') : 'جاري تجهيز قاعدة البيانات المحلية…'}</p></div></div>
    {!ready ? <p role="status" style={styles.notice}>لحظة واحدة…</p> : <form onSubmit={submit}>
      <label style={styles.label}>اسم المستخدم</label><input style={styles.input} autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} required minLength={3} maxLength={40} placeholder="3 إلى 40 حرفًا" />
      {mode === 'reset' && <><label style={styles.label}>رمز الاستعادة</label><input style={styles.input} dir="ltr" autoComplete="off" value={recoveryCode} onChange={e=>setRecoveryCode(e.target.value)} required maxLength={64} placeholder="XXXX-XXXX-XXXX-XXXX-..." /></>}
      <label style={styles.label}>{mode === 'reset' ? 'كلمة المرور الجديدة' : 'كلمة المرور'}</label><input style={styles.input} type="password" autoComplete={setup || mode === 'reset' ? 'new-password' : 'current-password'} value={password} onChange={e=>setPassword(e.target.value)} required minLength={mode === 'reset' || setup ? 10 : undefined} maxLength={256} placeholder="10 أحرف على الأقل" />
      {(setup || mode === 'reset') && <><label style={styles.label}>تأكيد كلمة المرور</label><input style={styles.input} type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} required minLength={10} maxLength={256} /></>}
      {error && <p role="alert" style={styles.error}>{error}</p>}
      <button disabled={busy} style={{...styles.submit, opacity:busy ? .72 : 1, cursor:busy ? 'wait' : 'pointer'}}>{busy ? 'لحظة واحدة…' : setup ? 'إنشاء الحساب وفتح البرنامج' : mode === 'reset' ? 'تعيين كلمة المرور' : 'تسجيل الدخول'} <span aria-hidden="true">←</span></button>
      {!setup && <button type="button" style={styles.link} onClick={()=>{setMode(mode === 'login' ? 'reset' : 'login');setError('');setPassword('');setConfirm('');setRecoveryCode('')}}>{mode === 'login' ? 'نسيت كلمة المرور؟' : 'العودة لتسجيل الدخول'}</button>}
      <div style={styles.footerRule} /><p style={styles.foot}>{mode === 'reset' ? 'الحساب القديم الذي لم يُنشأ له رمز استعادة لا يمكن استرجاعه ذاتيًا بعد نسيان كلمة المرور. إذا كنت تعرف كلمة المرور، سجّل الدخول لتوليد رمز استعادة.' : 'كلمة المرور تُخزّن كبصمة مشتقة مع salt، وليست كنص مكشوف. احفظها ورمز الاستعادة في مكان آمن.'}</p>
    </form>}
  </section></main>
}

export default function DesktopAuthGate({ children }: { children: ReactNode }) {
  return isDesktopApp() ? <LocalDesktopAuthGate>{children}</LocalDesktopAuthGate> : <CloudAuthGate>{children}</CloudAuthGate>
}


const styles = {
  page: { boxSizing:'border-box', minHeight:'100vh', display:'grid', placeItems:'center', padding:'28px 18px', background:'radial-gradient(ellipse at 12% 18%, rgba(242,104,34,.16), transparent 32%), radial-gradient(ellipse at 88% 82%, rgba(255,173,87,.08), transparent 35%), #0c0e10', fontFamily:"'Cairo','Segoe UI',Tahoma,Arial,sans-serif", position:'relative' } as const,
  card: { boxSizing:'border-box', position:'relative', overflow:'hidden', width:'100%', maxWidth:520, padding:'30px 34px 26px', borderRadius:14, background:'linear-gradient(145deg,#1b1d20,#141618)', color:'#f4f1ec', boxShadow:'0 26px 76px rgba(0,0,0,.4)', border:'1px solid #40372e' } as const,
  accent: { position:'absolute', top:0, right:28, left:28, height:2, background:'linear-gradient(90deg,transparent,#f26822,#ffad57,transparent)' } as const,
  brandHeader: { display:'flex', alignItems:'center', justifyContent:'center', padding:'8px 0 22px', borderBottom:'1px solid rgba(255,255,255,.1)', textAlign:'center' } as const,
  brandCopy: { textAlign:'center' } as const,
  eyebrow: { fontSize:13, letterSpacing:.2, color:'#ffad57', fontWeight:800, marginBottom:3 } as const,
  heading: { margin:'0 0 2px', fontSize:25, lineHeight:1.5, color:'#fff', fontWeight:900 } as const,
  brandSubtitle: { margin:0, fontSize:12, color:'#c2beb7', lineHeight:1.8 } as const,
  sectionHead: { display:'flex', alignItems:'flex-start', gap:12, margin:'25px 0 18px' } as const,
  secureMark: { flexShrink:0, width:36, height:36, display:'grid', placeItems:'center', borderRadius:9, background:'rgba(242,104,34,.12)', border:'1px solid rgba(242,104,34,.28)', color:'#ffad57' } as const,
  subheading: { margin:'0 0 5px', fontSize:20, color:'#fff', fontWeight:800 } as const,
  description: { margin:0, color:'#c2beb7', fontSize:13, lineHeight:1.9 } as const,
  label: { display:'block', margin:'15px 0 7px', fontWeight:700, fontSize:13, color:'#e1ddd5' } as const,
  input: { boxSizing:'border-box', display:'block', width:'100%', minHeight:46, border:'1px solid #49433d', borderRadius:8, padding:'12px 14px', background:'#111315', color:'#fff', fontSize:14, outlineColor:'#f26822' } as const,
  submit: { display:'flex', alignItems:'center', justifyContent:'center', gap:10, width:'100%', minHeight:48, marginTop:23, border:'1px solid #f26822', borderRadius:8, padding:'13px 16px', background:'linear-gradient(120deg,#f4772b,#de4f1b)', color:'#17120e', fontWeight:800, fontSize:15, cursor:'pointer', boxShadow:'0 8px 22px rgba(242,104,34,.18)' } as const,
  links: { display:'flex', justifyContent:'center', flexWrap:'wrap', gap:'7px 15px', marginTop:16, fontSize:12 } as const,
  link: { border:0, background:'transparent', color:'#ffc184', cursor:'pointer', padding:'5px 4px', fontWeight:700, fontSize:12 } as const,
  error: { color:'#ffd8d4', background:'rgba(127,29,29,.24)', border:'1px solid rgba(248,113,113,.24)', padding:12, borderRadius:9, margin:'16px 0 0', lineHeight:1.7, fontSize:13 } as const,
  notice: { color:'#e5eaf0', background:'#222a35', border:'1px solid rgba(255,255,255,.08)', padding:12, borderRadius:9, margin:'16px 0 0', lineHeight:1.7, fontSize:13 } as const,
  footerRule: { height:1, background:'rgba(255,255,255,.09)', marginTop:22 } as const,
  lockDot: { color:'#e66b78', fontSize:10, marginLeft:5 } as const,
  foot: { textAlign:'center', fontSize:11, color:'#8492a3', lineHeight:1.8, margin:'13px 0 0' } as const,
}
