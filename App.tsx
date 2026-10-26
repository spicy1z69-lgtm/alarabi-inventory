import { useEffect, useMemo, useState } from 'react'
import {
  Boxes, LayoutDashboard, Package, FileText, Search, Plus, Pencil, Trash2,
  AlertTriangle, TrendingUp, X, Printer, Download, Check, ClipboardList,
} from 'lucide-react'
import type { Product, Quote, QuoteItem } from './types'

const seed: Product[] = [
  { id: 'p1', code: 'CON-004', name: 'كونتاكتور 25 أمبير', category: 'كونتاكتورات', quantity: 12, price: 420, minStock: 3 },
  { id: 'p2', code: 'CAP-020', name: 'مكثف 20 ميكروفاراد', category: 'مكثفات', quantity: 18, price: 160, minStock: 5 },
  { id: 'p3', code: 'FAN-009', name: 'مروحة تكييف خارجية', category: 'مراوح', quantity: 4, price: 950, minStock: 2 },
  { id: 'p4', code: 'PCB-012', name: 'كارت تحكم تكييف', category: 'كروت إلكترونية', quantity: 2, price: 1350, minStock: 3 },
]

const money = (n: number) => new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 2 }).format(n)
const today = () => new Date().toISOString().slice(0, 10)
const load = <T,>(key: string, fallback: T): T => {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback } catch { return fallback }
}

type Tab = 'dashboard' | 'products' | 'quotes'

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [products, setProducts] = useState<Product[]>(() => load('alarabi-products', seed))
  const [quotes, setQuotes] = useState<Quote[]>(() => load('alarabi-quotes', []))
  const [query, setQuery] = useState('')
  const [productModal, setProductModal] = useState<Product | null | 'new'>(null)
  const [quoteModal, setQuoteModal] = useState(false)
  const [notice, setNotice] = useState('')
  const [customer, setCustomer] = useState('')
  const [quoteRows, setQuoteRows] = useState<QuoteItem[]>([])
  const [draft, setDraft] = useState({ code: '', name: '', category: '', quantity: '0', price: '0', minStock: '2' })

  useEffect(() => { localStorage.setItem('alarabi-products', JSON.stringify(products)) }, [products])
  useEffect(() => { localStorage.setItem('alarabi-quotes', JSON.stringify(quotes)) }, [quotes])

  const inventoryValue = products.reduce((sum, p) => sum + p.quantity * p.price, 0)
  const lowStock = products.filter(p => p.quantity <= p.minStock)
  const filtered = useMemo(() => products.filter(p => `${p.name} ${p.code} ${p.category}`.toLowerCase().includes(query.toLowerCase().trim())), [products, query])

  const openProduct = (p?: Product) => {
    setDraft(p ? { code: p.code, name: p.name, category: p.category, quantity: String(p.quantity), price: String(p.price), minStock: String(p.minStock) } : { code: '', name: '', category: '', quantity: '0', price: '0', minStock: '2' })
    setProductModal(p ?? 'new')
  }
  const saveProduct = () => {
    if (!draft.code.trim() || !draft.name.trim()) { setNotice('اكتب كود الصنف واسم الصنف الأول'); return }
    const item: Product = { id: productModal !== 'new' && productModal ? productModal.id : crypto.randomUUID(), code: draft.code.trim(), name: draft.name.trim(), category: draft.category.trim() || 'عام', quantity: Math.max(0, Number(draft.quantity) || 0), price: Math.max(0, Number(draft.price) || 0), minStock: Math.max(0, Number(draft.minStock) || 0) }
    setProducts(old => productModal !== 'new' && productModal ? old.map(p => p.id === item.id ? item : p) : [item, ...old])
    setProductModal(null); setNotice('تم حفظ الصنف')
  }
  const addQuoteRow = (p: Product) => {
    setQuoteRows(old => {
      const existing = old.find(x => x.productId === p.id)
      return existing ? old.map(x => x.productId === p.id ? { ...x, quantity: x.quantity + 1 } : x) : [...old, { productId: p.id, name: p.name, code: p.code, quantity: 1, price: p.price }]
    })
  }
  const quoteTotal = quoteRows.reduce((sum, row) => sum + row.quantity * row.price, 0)
  const saveQuote = () => {
    if (!customer.trim() || !quoteRows.length) { setNotice('اكتب اسم العميل وأضف صنفًا واحدًا على الأقل'); return }
    const quote: Quote = { id: crypto.randomUUID(), number: `QT-${String(quotes.length + 1).padStart(4, '0')}`, customer: customer.trim(), date: today(), items: quoteRows }
    setQuotes(old => [quote, ...old]); setQuoteModal(false); setTab('quotes'); setCustomer(''); setQuoteRows([]); setNotice('تم حفظ عرض السعر')
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-mark"><Boxes size={24} /></div>
      <div className="brand-name">العربي <span>للمخزون</span></div>
      <div className="brand-caption">INVENTORY MANAGEMENT</div>
      <nav>
        <button className={tab === 'dashboard' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('dashboard')}><LayoutDashboard size={19}/> لوحة التحكم</button>
        <button className={tab === 'products' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('products')}><Package size={19}/> الأصناف والمخزون</button>
        <button className={tab === 'quotes' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('quotes')}><FileText size={19}/> عروض الأسعار <span className="nav-count">{quotes.length}</span></button>
      </nav>
      <div className="sidebar-foot"><span className="status-dot"/> النسخة التجريبية <small>v1.0.0</small></div>
    </aside>

    <main className="main">
      <header className="topbar"><div><div className="eyebrow">AL ARABI · INVENTORY</div><h1>{tab === 'dashboard' ? 'لوحة التحكم' : tab === 'products' ? 'الأصناف والمخزون' : 'عروض الأسعار'}</h1></div><div className="today-chip">{new Date().toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })}</div></header>
      {notice && <button className="notice" onClick={() => setNotice('')}><Check size={16}/>{notice}<X size={15}/></button>}

      {tab === 'dashboard' && <>
        <section className="welcome"><div><span className="welcome-label">أهلًا بيك 👋</span><h2>كل مخزونك في مكان واحد.</h2><p>تابع الأصناف والكميات، وجهّز عروض الأسعار بسهولة.</p></div><div className="welcome-art"><Boxes size={70}/></div></section>
        <section className="stats-grid">
          <Stat icon={<Package/>} label="إجمالي الأصناف" value={String(products.length)} foot="صنف مسجل" />
          <Stat icon={<Boxes/>} label="إجمالي الوحدات" value={String(products.reduce((s,p)=>s+p.quantity,0))} foot="وحدة في المخزن" />
          <Stat icon={<TrendingUp/>} label="قيمة المخزون" value={money(inventoryValue)} foot="حسب أسعار البيع" />
          <Stat icon={<AlertTriangle/>} label="أصناف منخفضة" value={String(lowStock.length)} foot="تحتاج مراجعة" warning={lowStock.length > 0}/>
        </section>
        <section className="panel"><div className="panel-head"><div><h3>الأصناف التي تحتاج متابعة</h3><p>الأصناف التي وصلت للحد الأدنى أو أقل</p></div><button className="text-button" onClick={() => setTab('products')}>عرض كل الأصناف ←</button></div>
          {lowStock.length ? <div className="table-wrap"><table><thead><tr><th>الصنف</th><th>الكود</th><th>الكمية الحالية</th><th>الحد الأدنى</th><th>الحالة</th></tr></thead><tbody>{lowStock.map(p=><tr key={p.id}><td className="product-cell">{p.name}</td><td><code>{p.code}</code></td><td>{p.quantity}</td><td>{p.minStock}</td><td><span className="pill danger">مخزون منخفض</span></td></tr>)}</tbody></table></div> : <Empty title="المخزون تمام" detail="لا توجد أصناف منخفضة حاليًا."/>}
        </section>
        <section className="panel"><div className="panel-head"><div><h3>آخر عروض الأسعار</h3><p>العروض التي تم حفظها مؤخرًا</p></div><button className="text-button" onClick={() => setTab('quotes')}>عرض العروض ←</button></div>
          {quotes.length ? <div className="quote-list">{quotes.slice(0,4).map(q=><div className="quote-list-row" key={q.id}><div className="quote-icon"><FileText size={18}/></div><div className="quote-info"><b>{q.number}</b><span>{q.customer} · {q.date}</span></div><strong>{money(q.items.reduce((s,x)=>s+x.quantity*x.price,0))}</strong><button className="icon-btn" aria-label="طباعة العرض" onClick={()=>window.print()}><Printer size={17}/></button></div>)}</div> : <Empty title="لسه مفيش عروض أسعار" detail="ابدأ بإنشاء أول عرض سعر لعميلك."/>}
        </section>
      </>}

      {tab === 'products' && <section className="panel">
        <div className="panel-head products-head"><div><h3>قائمة الأصناف</h3><p>إدارة أكواد الأصناف والكميات والأسعار</p></div><button className="primary-btn" onClick={() => openProduct()}><Plus size={17}/> إضافة صنف</button></div>
        <div className="toolbar"><label className="searchbox"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث بالاسم أو الكود أو الفئة..."/></label><span className="muted">{filtered.length} صنف</span></div>
        {filtered.length ? <div className="table-wrap"><table><thead><tr><th>اسم الصنف</th><th>الكود</th><th>الفئة</th><th>الكمية</th><th>سعر الوحدة</th><th>الحالة</th><th></th></tr></thead><tbody>{filtered.map(p=><tr key={p.id}><td className="product-cell">{p.name}</td><td><code>{p.code}</code></td><td>{p.category}</td><td>{p.quantity}</td><td>{money(p.price)}</td><td>{p.quantity <= p.minStock ? <span className="pill danger">منخفض</span> : <span className="pill success">متوفر</span>}</td><td className="actions"><button className="icon-btn" aria-label="تعديل" onClick={()=>openProduct(p)}><Pencil size={16}/></button><button className="icon-btn delete" aria-label="حذف" onClick={()=>{if(confirm(`حذف الصنف ${p.name}؟`))setProducts(old=>old.filter(x=>x.id!==p.id))}}><Trash2 size={16}/></button></td></tr>)}</tbody></table></div> : <Empty title="مش لاقيين أصناف" detail="جرّب كلمة بحث مختلفة أو أضف صنفًا جديدًا."/>}
      </section>}

      {tab === 'quotes' && <section className="panel">
        <div className="panel-head products-head"><div><h3>عروض الأسعار</h3><p>أنشئ عرضًا واطبعه أو احفظه كـ PDF</p></div><button className="primary-btn" onClick={()=>setQuoteModal(true)}><Plus size={17}/> عرض سعر جديد</button></div>
        {quotes.length ? <div className="quote-list">{quotes.map(q=><div className="quote-list-row" key={q.id}><div className="quote-icon"><FileText size={18}/></div><div className="quote-info"><b>{q.number}</b><span>{q.customer} · {q.date} · {q.items.length} صنف</span></div><strong>{money(q.items.reduce((s,x)=>s+x.quantity*x.price,0))}</strong><button className="icon-btn" onClick={()=>{const w=window.open('', '_blank', 'width=800,height=900'); if(!w)return; w.document.write(quoteHtml(q)); w.document.close(); w.print()}} aria-label="طباعة"><Printer size={17}/></button><button className="icon-btn delete" onClick={()=>{if(confirm('حذف عرض السعر؟'))setQuotes(old=>old.filter(x=>x.id!==q.id))}} aria-label="حذف"><Trash2 size={17}/></button></div>)}</div> : <Empty title="مفيش عروض أسعار لحد دلوقتي" detail="اضغط على عرض سعر جديد عشان تبدأ."/>}
      </section>}
    </main>

    {productModal && <div className="modal-backdrop" onClick={()=>setProductModal(null)}><section className="modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><h2>{productModal === 'new' ? 'إضافة صنف جديد' : 'تعديل الصنف'}</h2><p>املأ بيانات الصنف الأساسية</p></div><button className="icon-btn" onClick={()=>setProductModal(null)}><X/></button></div><div className="form-grid">
      <Field label="كود الصنف *" value={draft.code} onChange={v=>setDraft({...draft,code:v})} placeholder="مثال: CON-004"/>
      <Field label="اسم الصنف *" value={draft.name} onChange={v=>setDraft({...draft,name:v})} placeholder="اسم الصنف"/>
      <Field label="الفئة" value={draft.category} onChange={v=>setDraft({...draft,category:v})} placeholder="مثال: كونتاكتورات"/>
      <Field label="الكمية الحالية" type="number" value={draft.quantity} onChange={v=>setDraft({...draft,quantity:v})}/>
      <Field label="سعر الوحدة (جنيه)" type="number" value={draft.price} onChange={v=>setDraft({...draft,price:v})}/>
      <Field label="حد التنبيه الأدنى" type="number" value={draft.minStock} onChange={v=>setDraft({...draft,minStock:v})}/>
    </div><div className="modal-actions"><button className="secondary-btn" onClick={()=>setProductModal(null)}>إلغاء</button><button className="primary-btn" onClick={saveProduct}><Check size={17}/> حفظ الصنف</button></div></section></div>}

    {quoteModal && <div className="modal-backdrop" onClick={()=>setQuoteModal(false)}><section className="modal wide" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><h2>إنشاء عرض سعر</h2><p>اختار الأصناف وحدد الكميات المطلوبة</p></div><button className="icon-btn" onClick={()=>setQuoteModal(false)}><X/></button></div><Field label="اسم العميل *" value={customer} onChange={setCustomer} placeholder="اسم العميل أو الشركة"/><div className="pick-products"><h4>إضافة أصناف</h4>{products.map(p=><button className="pick-row" key={p.id} onClick={()=>addQuoteRow(p)}><span><b>{p.name}</b><small>{p.code} · {money(p.price)}</small></span><Plus size={18}/></button>)}</div>
      {quoteRows.length > 0 && <div className="quote-draft"><h4>الأصناف المختارة</h4>{quoteRows.map(row=><div className="draft-row" key={row.productId}><span>{row.name}<small>{money(row.price)} للوحدة</small></span><input aria-label="الكمية" type="number" min="1" value={row.quantity} onChange={e=>setQuoteRows(old=>old.map(x=>x.productId===row.productId?{...x,quantity:Math.max(1,Number(e.target.value)||1)}:x))}/><strong>{money(row.quantity*row.price)}</strong><button className="icon-btn delete" onClick={()=>setQuoteRows(old=>old.filter(x=>x.productId!==row.productId))}><X size={16}/></button></div>)}<div className="total-row"><span>الإجمالي</span><strong>{money(quoteTotal)}</strong></div></div>}
      <div className="modal-actions"><button className="secondary-btn" onClick={()=>setQuoteModal(false)}>إلغاء</button><button className="primary-btn" onClick={saveQuote}><Check size={17}/> حفظ عرض السعر</button></div></section></div>}

    <footer className="footer"><span>© {new Date().getFullYear()} العربي للمخزون</span><span><ClipboardList size={14}/> إدارة مخزون مبسطة</span></footer>
  </div>
}

function Stat({icon,label,value,foot,warning=false}:{icon:React.ReactNode,label:string,value:string,foot:string,warning?:boolean}) {
  return <div className="stat-card"><div className={warning?'stat-icon warning':'stat-icon'}>{icon}</div><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><small>{foot}</small></div>
}
function Empty({title,detail}:{title:string,detail:string}) { return <div className="empty-state"><div className="empty-icon"><Boxes size={24}/></div><b>{title}</b><span>{detail}</span></div> }
function Field({label,value,onChange,placeholder='',type='text'}:{label:string,value:string,onChange:(v:string)=>void,placeholder?:string,type?:string}) {
  return <label className="field"><span>{label}</span><input type={type} value={value} placeholder={placeholder} onChange={e=>onChange(e.target.value)}/></label>
}
function quoteHtml(q: Quote) {
  const total = q.items.reduce((s,x)=>s+x.quantity*x.price,0)
  return `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>عرض سعر ${q.number}</title><style>body{font-family:Arial,sans-serif;padding:36px;color:#18232d}h1{border-bottom:2px solid #18232d;padding-bottom:16px}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{border:1px solid #cbd2d8;padding:12px;text-align:right}th{background:#f1f4f6}.total{text-align:left;margin-top:24px;font-size:20px;font-weight:bold}.meta{line-height:2}</style><h1>العربي — عرض سعر</h1><div class="meta">رقم العرض: ${q.number}<br>العميل: ${escapeHtml(q.customer)}<br>التاريخ: ${q.date}</div><table><thead><tr><th>الكود</th><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead><tbody>${q.items.map(x=>`<tr><td>${escapeHtml(x.code)}</td><td>${escapeHtml(x.name)}</td><td>${x.quantity}</td><td>${x.price.toFixed(2)} ج.م</td><td>${(x.quantity*x.price).toFixed(2)} ج.م</td></tr>`).join('')}</tbody></table><div class="total">الإجمالي: ${total.toFixed(2)} جنيه مصري</div></html>`
}
function escapeHtml(s: string) { return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string)) }
