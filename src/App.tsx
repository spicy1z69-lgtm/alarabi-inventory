

import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import {
  Boxes, LayoutDashboard, Package, FileText, Search, Plus, Pencil,
  Trash2, AlertTriangle, TrendingUp, X, Printer, Check, ClipboardList, Receipt, CircleDollarSign,
} from 'lucide-react'
import type { Product, Quote, QuoteItem, Invoice } from './types'

const COMPANY = 'العربي لأنظمة التأريض والحماية من الصواعق'

const seed: Product[] = [
  {
    id: 'p1',
    code: 'GRD-001',
    name: 'قضيب تأريض نحاس 1.5 متر',
    category: 'قضبان التأريض',
    quantity: 12,
    price: 650,
    minStock: 3,
  },
  {
    id: 'p2',
    code: 'LPS-002',
    name: 'مانعة صواعق رأسية',
    category: 'الحماية من الصواعق',
    quantity: 18,
    price: 1250,
    minStock: 5,
  },
  {
    id: 'p3',
    code: 'CAB-003',
    name: 'كابل نحاس للتأريض 35 مم',
    category: 'كابلات التأريض',
    quantity: 4,
    price: 950,
    minStock: 2,
  },
  {
    id: 'p4',
    code: 'CLP-004',
    name: 'مشبك تأريض نحاس',
    category: 'وصلات ومشابك',
    quantity: 2,
    price: 350,
    minStock: 3,
  },
  {
    id: 'p5',
    code: 'PIT-005',
    name: 'غرفة تفتيش لنظام التأريض',
    category: 'غرف التفتيش',
    quantity: 8,
    price: 480,
    minStock: 2,
  },
  {
    id: 'p6',
    code: 'GEM-006',
    name: 'مادة تحسين مقاومة التربة',
    category: 'مواد التأريض',
    quantity: 10,
    price: 720,
    minStock: 3,
  },
]

const money = (n: number) =>
  new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP',
    maximumFractionDigits: 2,
  }).format(n)

const today = () => new Date().toISOString().slice(0, 10)

const load = <T,>(key: string, fallback: T): T => {
  try {
    const value = localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : fallback
  } catch {
    return fallback
  }
}

type Tab = 'dashboard' | 'products' | 'quotes' | 'invoices'

function InventoryApp({ user }: { user: User }) {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [cloudLoaded, setCloudLoaded] = useState(false)
  const [cloudError, setCloudError] = useState('')
  const [products, setProducts] = useState<Product[]>(() =>
    load('alarabi-products', seed)
  )
  const [quotes, setQuotes] = useState<Quote[]>(() =>
    load('alarabi-quotes', [])
  )
  const [invoices, setInvoices] = useState<Invoice[]>(() =>
    load('alarabi-invoices', [])
  )
  const [invoiceModal, setInvoiceModal] = useState(false)
  const [invoiceCustomer, setInvoiceCustomer] = useState('')
  const [invoicePhone, setInvoicePhone] = useState('')
  const [invoiceDueDate, setInvoiceDueDate] = useState('')
  const [invoiceDiscount, setInvoiceDiscount] = useState('0')
  const [invoiceTax, setInvoiceTax] = useState('0')
  const [invoiceStatus, setInvoiceStatus] = useState<'paid' | 'unpaid' | 'partial'>('unpaid')
  const [invoicePaid, setInvoicePaid] = useState('0')
  const [invoiceNotes, setInvoiceNotes] = useState('')
  const [query, setQuery] = useState('')
  const [productModal, setProductModal] = useState<Product | null | 'new'>(null)
  const [quoteModal, setQuoteModal] = useState(false)
  const [notice, setNotice] = useState('')
  const [customer, setCustomer] = useState('')
  const [quoteRows, setQuoteRows] = useState<QuoteItem[]>([])
  const [draft, setDraft] = useState({
    code: '',
    name: '',
    category: '',
    quantity: '0',
    price: '0',
    minStock: '2',
  })

  useEffect(() => {
    let active = true
    const loadCloudState = async () => {
      setCloudLoaded(false)
      setCloudError('')
      const { data, error } = await supabase.from('app_state').select('state_key,state_value').eq('owner_id', user.id)
      if (!active) return
      if (error) { setCloudError('تعذر تحميل البيانات السحابية: ' + error.message + ' — لم يتم تحميل البيانات، أعد المحاولة بعد إصلاح الاتصال.'); return }
      const values = new Map((data ?? []).map(row => [row.state_key, row.state_value]))
      const records = [
        { key: 'products', localKey: 'alarabi-products', fallback: seed, setter: setProducts },
        { key: 'quotes', localKey: 'alarabi-quotes', fallback: [] as Quote[], setter: setQuotes },
        { key: 'invoices', localKey: 'alarabi-invoices', fallback: [] as Invoice[], setter: setInvoices },
      ] as const
      for (const record of records) {
        const cloudValue = values.get(record.key)
        if (cloudValue !== undefined && cloudValue !== null) {
          record.setter(cloudValue as never)
          localStorage.setItem(record.localKey, JSON.stringify(cloudValue))
        } else {
          const localValue = load(record.localKey, record.fallback)
          record.setter(localValue as never)
          const { error: saveError } = await supabase.from('app_state').upsert({ owner_id: user.id, state_key: record.key, state_value: localValue, updated_at: new Date().toISOString() }, { onConflict: 'owner_id,state_key' })
          if (saveError && active) setCloudError('تعذر رفع البيانات الحالية: ' + saveError.message)
        }
      }
      if (active) setCloudLoaded(true)
    }
    void loadCloudState()
    return () => { active = false }
  }, [user.id])

  useEffect(() => {
    if (!cloudLoaded) return
    localStorage.setItem('alarabi-products', JSON.stringify(products))
    void supabase.from('app_state').upsert({ owner_id: user.id, state_key: 'products', state_value: products, updated_at: new Date().toISOString() }, { onConflict: 'owner_id,state_key' }).then(({ error }) => { if (error) setCloudError('مشكلة في حفظ الأصناف سحابيًا: ' + error.message) })
  }, [products, cloudLoaded, user.id])

  useEffect(() => {
    if (!cloudLoaded) return
    localStorage.setItem('alarabi-quotes', JSON.stringify(quotes))
    void supabase.from('app_state').upsert({ owner_id: user.id, state_key: 'quotes', state_value: quotes, updated_at: new Date().toISOString() }, { onConflict: 'owner_id,state_key' }).then(({ error }) => { if (error) setCloudError('مشكلة في حفظ عروض الأسعار سحابيًا: ' + error.message) })
  }, [quotes, cloudLoaded, user.id])

  useEffect(() => {
    if (!cloudLoaded) return
    localStorage.setItem('alarabi-invoices', JSON.stringify(invoices))
    void supabase.from('app_state').upsert({ owner_id: user.id, state_key: 'invoices', state_value: invoices, updated_at: new Date().toISOString() }, { onConflict: 'owner_id,state_key' }).then(({ error }) => { if (error) setCloudError('مشكلة في حفظ الفواتير سحابيًا: ' + error.message) })
  }, [invoices, cloudLoaded, user.id])

  const inventoryValue = products.reduce(
    (sum, p) => sum + p.quantity * p.price,
    0
  )

  const lowStock = products.filter(p => p.quantity <= p.minStock)

  const filtered = useMemo(
    () =>
      products.filter(p =>
        `${p.name} ${p.code} ${p.category}`
          .toLowerCase()
          .includes(query.toLowerCase().trim())
      ),
    [products, query]
  )

  const openProduct = (p?: Product) => {
    setDraft(
      p
        ? {
            code: p.code,
            name: p.name,
            category: p.category,
            quantity: String(p.quantity),
            price: String(p.price),
            minStock: String(p.minStock),
          }
        : {
            code: '',
            name: '',
            category: '',
            quantity: '0',
            price: '0',
            minStock: '2',
          }
    )
    setProductModal(p ?? 'new')
  }

  const saveProduct = () => {
    if (!draft.code.trim() || !draft.name.trim()) {
      setNotice('اكتب كود الصنف واسم الصنف الأول')
      return
    }

    const item: Product = {
      id:
        productModal !== 'new' && productModal
          ? productModal.id
          : crypto.randomUUID(),
      code: draft.code.trim(),
      name: draft.name.trim(),
      category: draft.category.trim() || 'عام',
      quantity: Math.max(0, Number(draft.quantity) || 0),
      price: Math.max(0, Number(draft.price) || 0),
      minStock: Math.max(0, Number(draft.minStock) || 0),
    }

    setProducts(old =>
      productModal !== 'new' && productModal
        ? old.map(p => (p.id === item.id ? item : p))
        : [item, ...old]
    )

    setProductModal(null)
    setNotice('تم حفظ الصنف')
  }

  const addQuoteRow = (p: Product) => {
    setQuoteRows(old => {
      const existing = old.find(x => x.productId === p.id)

      return existing
        ? old.map(x =>
            x.productId === p.id
              ? { ...x, quantity: x.quantity + 1 }
              : x
          )
        : [
            ...old,
            {
              productId: p.id,
              name: p.name,
              code: p.code,
              quantity: 1,
              price: p.price,
            },
          ]
    })
  }

  const quoteTotal = quoteRows.reduce(
    (sum, row) => sum + row.quantity * row.price,
    0
  )
  const invoiceSubtotal = quoteTotal
  const invoiceDiscountValue = Math.max(0, Number(invoiceDiscount) || 0)
  const invoiceTaxValue = Math.max(0, Number(invoiceTax) || 0)
  const invoiceTotal = Math.max(0, invoiceSubtotal - invoiceDiscountValue) * (1 + invoiceTaxValue / 100)
  const invoiceBalance = Math.max(0, invoiceTotal - (Number(invoicePaid) || 0))

  const resetInvoiceDraft = () => {
    setInvoiceCustomer('')
    setInvoicePhone('')
    setInvoiceDueDate('')
    setInvoiceDiscount('0')
    setInvoiceTax('0')
    setInvoiceStatus('unpaid')
    setInvoicePaid('0')
    setInvoiceNotes('')
    setQuoteRows([])
  }

  const saveInvoice = () => {
    if (!invoiceCustomer.trim() || !quoteRows.length) {
      setNotice('اكتب اسم العميل وأضف صنفًا واحدًا على الأقل')
      return
    }
    if (invoiceDiscountValue > invoiceSubtotal) {
      setNotice('الخصم لا يمكن أن يكون أكبر من قيمة الأصناف')
      return
    }

    // Validate stock before creating an invoice; combine repeated product rows.
    const quantitiesByProduct = new Map<string, number>()
    for (const row of quoteRows) {
      quantitiesByProduct.set(row.productId, (quantitiesByProduct.get(row.productId) || 0) + row.quantity)
    }
    for (const [productId, quantity] of quantitiesByProduct) {
      const product = products.find(item => item.id === productId)
      if (!product) {
        setNotice('يوجد صنف في الفاتورة غير موجود بالمخزون')
        return
      }
      if (quantity > product.quantity) {
        setNotice(`الكمية المطلوبة من "${product.name}" أكبر من المتاح بالمخزون (المتاح: ${product.quantity})`)
        return
      }
    }

    const nextInvoiceNumber = invoices.reduce((max, item) => {
      const match = item.number.match(/^INV-(\d+)$/)
      return match ? Math.max(max, Number(match[1])) : max
    }, 0) + 1
    const total = invoiceTotal
    const paid = invoiceStatus === 'paid' ? total : Math.min(total, Math.max(0, Number(invoicePaid) || 0))
    const invoice: Invoice = {
      id: crypto.randomUUID(),
      number: `INV-${String(nextInvoiceNumber).padStart(4, '0')}`,
      customer: invoiceCustomer.trim(),
      phone: invoicePhone.trim(),
      date: today(),
      dueDate: invoiceDueDate,
      items: quoteRows.map(row => ({...row})),
      discount: invoiceDiscountValue,
      tax: invoiceTaxValue,
      status: invoiceStatus === 'paid' || paid >= total ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
      paidAmount: paid,
      notes: invoiceNotes.trim(),
    }
    setProducts(old => old.map(product => ({
      ...product,
      quantity: product.quantity - (quantitiesByProduct.get(product.id) || 0),
    })))
    setInvoices(old => [invoice, ...old])
    setInvoiceModal(false)
    setTab('invoices')
    resetInvoiceDraft()
    setNotice('تم حفظ الفاتورة وخصم الكميات من المخزون بنجاح')
  }

  const printInvoice = (invoice: Invoice) => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      setNotice('اسمح بفتح النوافذ المنبثقة لطباعة الفاتورة')
      return
    }
    printWindow.document.write(invoiceHtml(invoice))
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  const updateInvoiceStatus = (invoice: Invoice, status: Invoice['status']) => {
    const paidAmount = status === 'paid'
      ? invoiceTotalFor(invoice)
      : status === 'unpaid' ? 0 : invoice.paidAmount
    setInvoices(old => old.map(item => item.id === invoice.id
      ? {...item, status, paidAmount: Math.min(invoiceTotalFor(item), paidAmount)}
      : item))
  }

  const saveQuote = () => {
    if (!customer.trim() || !quoteRows.length) {
      setNotice('اكتب اسم العميل وأضف صنفًا واحدًا على الأقل')
      return
    }

    const quote: Quote = {
      id: crypto.randomUUID(),
      number: `QT-${String(quotes.length + 1).padStart(4, '0')}`,
      customer: customer.trim(),
      date: today(),
      items: quoteRows,
    }

    setQuotes(old => [quote, ...old])
    setQuoteModal(false)
    setTab('quotes')
    setCustomer('')
    setQuoteRows([])
    setNotice('تم حفظ عرض السعر')
  }

  const printQuote = (q: Quote) => {
    const printWindow = window.open('', '_blank')

    if (!printWindow) {
      setNotice('اسمح بفتح النوافذ المنبثقة لطباعة عرض السعر')
      return
    }

    printWindow.document.write(quoteHtml(q))
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark">
          <Boxes size={24} />
        </div>

        <div className="brand-name">
          العربي <span>لأنظمة التأريض</span>
        </div>

        <div className="brand-caption">
          EARTHING & LIGHTNING PROTECTION
        </div>

        <nav>
          <button
            className={tab === 'dashboard' ? 'nav-item active' : 'nav-item'}
            onClick={() => setTab('dashboard')}
          >
            <LayoutDashboard size={19} /> لوحة التحكم
          </button>

          <button
            className={tab === 'products' ? 'nav-item active' : 'nav-item'}
            onClick={() => setTab('products')}
          >
            <Package size={19} /> الأصناف والمخزون
          </button>

          <button
            className={tab === 'quotes' ? 'nav-item active' : 'nav-item'}
            onClick={() => setTab('quotes')}
          >
            <FileText size={19} /> عروض الأسعار
            <span className="nav-count">{quotes.length}</span>
          </button>

          <button
            className={tab === 'invoices' ? 'nav-item active' : 'nav-item'}
            onClick={() => setTab('invoices')}
          >
            <Receipt size={19} /> الفواتير
            <span className="nav-count">{invoices.length}</span>
          </button>
        </nav>

        <button className="nav-item" onClick={() => void supabase.auth.signOut()}>تسجيل الخروج</button>
        <div className="sidebar-foot">
          <span className="status-dot" /> إدارة المخزون
          <small>v1.0.0</small>
        </div>
      </aside>

      <main className="main">
        {!cloudLoaded && <div className="notice">جارٍ تحميل بياناتك من السحابة...</div>}
        {cloudError && <button className="notice" onClick={() => setCloudError('')}>⚠ {cloudError} <X size={15} /></button>}
        <header className="topbar">
          <div>
            <div className="eyebrow">
              AL ARABI · EARTHING & LIGHTNING PROTECTION
            </div>

            <h1>
              {tab === 'dashboard'
                ? 'لوحة التحكم'
                : tab === 'products'
                  ? 'الأصناف والمخزون'
                  : tab === 'quotes' ? 'عروض الأسعار' : 'الفواتير'}
            </h1>
          </div>

          <div className="today-chip">
            {new Date().toLocaleDateString('ar-EG', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </div>
        </header>

        {notice && (
          <button className="notice" onClick={() => setNotice('')}>
            <Check size={16} />
            {notice}
            <X size={15} />
          </button>
        )}

        {tab === 'dashboard' && (
          <>
            <section className="welcome">
              <div>
                <span className="welcome-label">أهلًا بيك 👋</span>
                <h2>أنظمة التأريض والحماية من الصواعق.</h2>
                <p>
                  تابع الأصناف والكميات، وراجع المخزون وجهّز عروض الأسعار
                  لعملائك بسهولة.
                </p>
              </div>

              <div className="welcome-art">
                <Boxes size={70} />
              </div>
            </section>

            <section className="stats-grid">
              <Stat
                icon={<Package />}
                label="إجمالي الأصناف"
                value={String(products.length)}
                foot="صنف مسجل"
              />

              <Stat
                icon={<Boxes />}
                label="إجمالي الوحدات"
                value={String(
                  products.reduce((s, p) => s + p.quantity, 0)
                )}
                foot="وحدة في المخزن"
              />

              <Stat
                icon={<TrendingUp />}
                label="قيمة المخزون"
                value={money(inventoryValue)}
                foot="حسب أسعار البيع"
              />

              <Stat
                icon={<AlertTriangle />}
                label="أصناف منخفضة"
                value={String(lowStock.length)}
                foot="تحتاج مراجعة"
                warning={lowStock.length > 0}
              />
            </section>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <h3>الأصناف التي تحتاج متابعة</h3>
                  <p>الأصناف التي وصلت للحد الأدنى أو أقل</p>
                </div>

                <button
                  className="text-button"
                  onClick={() => setTab('products')}
                >
                  عرض كل الأصناف ←
                </button>
              </div>

              {lowStock.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>الصنف</th>
                        <th>الكود</th>
                        <th>الكمية الحالية</th>
                        <th>الحد الأدنى</th>
                        <th>الحالة</th>
                      </tr>
                    </thead>

                    <tbody>
                      {lowStock.map(p => (
                        <tr key={p.id}>
                          <td className="product-cell">{p.name}</td>
                          <td><code>{p.code}</code></td>
                          <td>{p.quantity}</td>
                          <td>{p.minStock}</td>
                          <td>
                            <span className="pill danger">
                              مخزون منخفض
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="المخزون تمام"
                  detail="لا توجد أصناف منخفضة حاليًا."
                />
              )}
            </section>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <h3>آخر عروض الأسعار</h3>
                  <p>العروض التي تم حفظها مؤخرًا</p>
                </div>

                <button
                  className="text-button"
                  onClick={() => setTab('quotes')}
                >
                  عرض العروض ←
                </button>
              </div>

              {quotes.length ? (
                <div className="quote-list">
                  {quotes.slice(0, 4).map(q => (
                    <div className="quote-list-row" key={q.id}>
                      <div className="quote-icon">
                        <FileText size={18} />
                      </div>

                      <div className="quote-info">
                        <b>{q.number}</b>
                        <span>{q.customer} · {q.date}</span>
                      </div>

                      <strong>
                        {money(
                          q.items.reduce(
                            (s, x) => s + x.quantity * x.price,
                            0
                          )
                        )}
                      </strong>

                      <button
                        className="icon-btn"
                        aria-label="طباعة العرض"
                        onClick={() => printQuote(q)}
                      >
                        <Printer size={17} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty
                  title="لسه مفيش عروض أسعار"
                  detail="ابدأ بإنشاء أول عرض سعر لعميلك."
                />
              )}
            </section>
          </>
        )}

        {tab === 'products' && (
          <section className="panel">
            <div className="panel-head products-head">
              <div>
                <h3>قائمة الأصناف</h3>
                <p>إدارة أكواد الأصناف والكميات والأسعار</p>
              </div>

              <button className="primary-btn" onClick={() => openProduct()}>
                <Plus size={17} /> إضافة صنف
              </button>
            </div>

            <div className="toolbar">
              <label className="searchbox">
                <Search size={18} />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="ابحث بالاسم أو الكود أو الفئة..."
                />
              </label>

              <span className="muted">{filtered.length} صنف</span>
            </div>

            {filtered.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>اسم الصنف</th>
                      <th>الكود</th>
                      <th>الفئة</th>
                      <th>الكمية</th>
                      <th>سعر الوحدة</th>
                      <th>الحالة</th>
                      <th></th>
                    </tr>
                  </thead>

                  <tbody>
                    {filtered.map(p => (
                      <tr key={p.id}>
                        <td className="product-cell">{p.name}</td>
                        <td><code>{p.code}</code></td>
                        <td>{p.category}</td>
                        <td>{p.quantity}</td>
                        <td>{money(p.price)}</td>
                        <td>
                          {p.quantity <= p.minStock ? (
                            <span className="pill danger">منخفض</span>
                          ) : (
                            <span className="pill success">متوفر</span>
                          )}
                        </td>
                        <td className="actions">
                          <button
                            className="icon-btn"
                            aria-label="تعديل"
                            onClick={() => openProduct(p)}
                          >
                            <Pencil size={16} />
                          </button>

                          <button
                            className="icon-btn delete"
                            aria-label="حذف"
                            onClick={() => {
                              if (confirm(`حذف الصنف ${p.name}؟`)) {
                                setProducts(old =>
                                  old.filter(x => x.id !== p.id)
                                )
                              }
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title="مش لاقيين أصناف"
                detail="جرّب كلمة بحث مختلفة أو أضف صنفًا جديدًا."
              />
            )}
          </section>
        )}

        {tab === 'invoices' && (
          <>
            <section className="stats-grid invoice-stats">
              <Stat icon={<Receipt />} label="إجمالي الفواتير" value={String(invoices.length)} foot="فاتورة مسجلة" />
              <Stat icon={<CircleDollarSign />} label="إجمالي المبيعات" value={money(invoices.reduce((s, i) => s + invoiceTotalFor(i), 0))} foot="قيمة الفواتير" />
              <Stat icon={<Check />} label="المحصّل" value={money(invoices.reduce((s, i) => s + i.paidAmount, 0))} foot="مبالغ مدفوعة" />
              <Stat icon={<AlertTriangle />} label="المتبقي" value={money(invoices.reduce((s, i) => s + Math.max(0, invoiceTotalFor(i) - i.paidAmount), 0))} foot="مبالغ مستحقة" warning={invoices.some(i => invoiceTotalFor(i) > i.paidAmount)} />
            </section>
            <section className="panel">
              <div className="panel-head products-head">
                <div><h3>إدارة الفواتير</h3><p>إنشاء فاتورة، متابعة التحصيل، وطباعة نسخة PDF</p></div>
                <button className="primary-btn" onClick={() => { resetInvoiceDraft(); setInvoiceModal(true) }}><Plus size={17} /> فاتورة جديدة</button>
              </div>
              {invoices.length ? <div className="table-wrap"><table>
                <thead><tr><th>رقم الفاتورة</th><th>العميل</th><th>التاريخ</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th><th>إجراءات</th></tr></thead>
                <tbody>{invoices.map(inv => {
                  const total = invoiceTotalFor(inv)
                  const balance = Math.max(0, total - inv.paidAmount)
                  return <tr key={inv.id}>
                    <td><code>{inv.number}</code></td><td className="product-cell">{inv.customer}</td><td>{inv.date}</td>
                    <td>{money(total)}</td><td>{money(inv.paidAmount)}</td><td>{money(balance)}</td>
                    <td><span className={inv.status === 'paid' ? 'pill success' : 'pill danger'}>{inv.status === 'paid' ? 'مدفوعة' : inv.status === 'partial' ? 'مدفوعة جزئيًا' : 'غير مدفوعة'}</span></td>
                    <td className="actions">
                      <button className="icon-btn" aria-label="طباعة الفاتورة" onClick={() => printInvoice(inv)}><Printer size={16} /></button>
                      <button className="secondary-btn invoice-status-btn" onClick={() => updateInvoiceStatus(inv, inv.status === 'paid' ? 'unpaid' : 'paid')}>{inv.status === 'paid' ? 'إلغاء السداد' : 'تسجيل مدفوعة'}</button>
                    </td>
                  </tr>
                })}</tbody>
              </table></div> : <Empty title="لسه مفيش فواتير" detail="اضغط فاتورة جديدة لإنشاء أول فاتورة." />}
            </section>
          </>
        )}

        {tab === 'quotes' && (
          <section className="panel">
            <div className="panel-head products-head">
              <div>
                <h3>عروض الأسعار</h3>
                <p>أنشئ عرضًا واطبعه أو احفظه كـ PDF</p>
              </div>

              <button
                className="primary-btn"
                onClick={() => setQuoteModal(true)}
              >
                <Plus size={17} /> عرض سعر جديد
              </button>
            </div>

            {quotes.length ? (
              <div className="quote-list">
                {quotes.map(q => (
                  <div className="quote-list-row" key={q.id}>
                    <div className="quote-icon">
                      <FileText size={18} />
                    </div>

                    <div className="quote-info">
                      <b>{q.number}</b>
                      <span>
                        {q.customer} · {q.date} · {q.items.length} صنف
                      </span>
                    </div>

                    <strong>
                      {money(
                        q.items.reduce(
                          (s, x) => s + x.quantity * x.price,
                          0
                        )
                      )}
                    </strong>

                    <button
                      className="icon-btn"
                      aria-label="طباعة عرض السعر"
                      onClick={() => printQuote(q)}
                    >
                      <Printer size={17} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                title="لسه مفيش عروض أسعار"
                detail="اضغط على عرض سعر جديد عشان تبدأ."
              />
            )}
          </section>
        )}
      </main>

      {productModal && (
        <div
          className="modal-backdrop"
          onClick={() => setProductModal(null)}
        >
          <section className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>
                  {productModal === 'new'
                    ? 'إضافة صنف جديد'
                    : 'تعديل الصنف'}
                </h2>
                <p>املأ بيانات الصنف الأساسية</p>
              </div>

              <button
                className="icon-btn"
                onClick={() => setProductModal(null)}
              >
                <X />
              </button>
            </div>

            <div className="form-grid">
              <Field
                label="كود الصنف *"
                value={draft.code}
                onChange={v => setDraft({ ...draft, code: v })}
                placeholder="مثال: GRD-001"
              />

              <Field
                label="اسم الصنف *"
                value={draft.name}
                onChange={v => setDraft({ ...draft, name: v })}
                placeholder="اسم الصنف"
              />

              <Field
                label="الفئة"
                value={draft.category}
                onChange={v => setDraft({ ...draft, category: v })}
                placeholder="مثال: قضبان التأريض"
              />

              <Field
                label="الكمية الحالية"
                type="number"
                value={draft.quantity}
                onChange={v => setDraft({ ...draft, quantity: v })}
              />

              <Field
                label="سعر الوحدة (جنيه)"
                type="number"
                value={draft.price}
                onChange={v => setDraft({ ...draft, price: v })}
              />

              <Field
                label="حد التنبيه الأدنى"
                type="number"
                value={draft.minStock}
                onChange={v => setDraft({ ...draft, minStock: v })}
              />
            </div>

            <div className="modal-actions">
              <button
                className="secondary-btn"
                onClick={() => setProductModal(null)}
              >
                إلغاء
              </button>

              <button className="primary-btn" onClick={saveProduct}>
                <Check size={17} /> حفظ الصنف
              </button>
            </div>
          </section>
        </div>
      )}

      {quoteModal && (
        <div
          className="modal-backdrop"
          onClick={() => setQuoteModal(false)}
        >
          <section
            className="modal wide"
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <h2>إنشاء عرض سعر</h2>
                <p>اختار الأصناف وحدد الكميات المطلوبة</p>
              </div>

              <button
                className="icon-btn"
                onClick={() => setQuoteModal(false)}
              >
                <X />
              </button>
            </div>

            <Field
              label="اسم العميل *"
              value={customer}
              onChange={setCustomer}
              placeholder="اسم العميل أو الشركة"
            />

            <div className="pick-products">
              <h4>إضافة أصناف</h4>

              {products.map(p => (
                <button
                  className="pick-row"
                  key={p.id}
                  onClick={() => addQuoteRow(p)}
                >
                  <span>
                    <b>{p.name}</b>
                    <small>{p.code} · {money(p.price)}</small>
                  </span>
                  <Plus size={18} />
                </button>
              ))}
            </div>

            {quoteRows.length > 0 && (
              <div className="quote-draft">
                <h4>الأصناف المختارة</h4>

                {quoteRows.map(row => (
                  <div className="draft-row" key={row.productId}>
                    <span>
                      {row.name}
                      <small>{money(row.price)} للوحدة</small>
                    </span>

                    <input
                      aria-label="الكمية"
                      type="number"
                      min="1"
                      value={row.quantity}
                      onChange={e =>
                        setQuoteRows(old =>
                          old.map(x =>
                            x.productId === row.productId
                              ? {
                                  ...x,
                                  quantity: Math.max(
                                    1,
                                    Number(e.target.value) || 1
                                  ),
                                }
                              : x
                          )
                        )
                      }
                    />

                    <strong>{money(row.quantity * row.price)}</strong>

                    <button
                      className="icon-btn delete"
                      onClick={() =>
                        setQuoteRows(old =>
                          old.filter(x => x.productId !== row.productId)
                        )
                      }
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}

                <div className="total-row">
                  <span>الإجمالي</span>
                  <strong>{money(quoteTotal)}</strong>
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button
                className="secondary-btn"
                onClick={() => setQuoteModal(false)}
              >
                إلغاء
              </button>

              <button className="primary-btn" onClick={saveQuote}>
                <Check size={17} /> حفظ عرض السعر
              </button>
            </div>
          </section>
        </div>
      )}

      {invoiceModal && (
        <div className="modal-backdrop" onClick={() => setInvoiceModal(false)}>
          <section className="modal wide" onClick={e => e.stopPropagation()}>
            <div className="modal-head"><div><h2>إنشاء فاتورة جديدة</h2><p>فاتورة بيع رسمية قابلة للطباعة أو الحفظ PDF</p></div><button className="icon-btn" onClick={() => setInvoiceModal(false)}><X /></button></div>
            <div className="form-grid">
              <Field label="اسم العميل / الشركة *" value={invoiceCustomer} onChange={setInvoiceCustomer} placeholder="اسم العميل" />
              <Field label="رقم الهاتف" value={invoicePhone} onChange={setInvoicePhone} placeholder="01xxxxxxxxx" />
              <Field label="تاريخ الاستحقاق" type="date" value={invoiceDueDate} onChange={setInvoiceDueDate} />
              <Field label="الخصم (جنيه)" type="number" value={invoiceDiscount} onChange={setInvoiceDiscount} />
              <Field label="الضريبة (%)" type="number" value={invoiceTax} onChange={setInvoiceTax} />
              <Field label="المبلغ المدفوع (جنيه)" type="number" value={invoicePaid} onChange={v => {setInvoicePaid(v); setInvoiceStatus(Number(v) > 0 ? 'partial' : 'unpaid')}} />
            </div>
            <div className="pick-products"><h4>اختار الأصناف</h4>{products.map(p => <button className="pick-row" key={p.id} onClick={() => addQuoteRow(p)}><span><b>{p.name}</b><small>{p.code} · {money(p.price)} للوحدة · المتاح {p.quantity}</small></span><Plus size={18} /></button>)}</div>
            {quoteRows.length > 0 && <div className="quote-draft"><h4>تفاصيل الفاتورة</h4>{quoteRows.map(row => <div className="draft-row" key={row.productId}><span>{row.name}<small>{money(row.price)} للوحدة</small></span><input aria-label="الكمية" type="number" min="1" value={row.quantity} onChange={e => setQuoteRows(old => old.map(x => x.productId === row.productId ? {...x, quantity: Math.max(1, Number(e.target.value) || 1)} : x))} /><strong>{money(row.quantity * row.price)}</strong><button className="icon-btn delete" onClick={() => setQuoteRows(old => old.filter(x => x.productId !== row.productId))}><X size={16} /></button></div>)}
              <Field label="ملاحظات الفاتورة" value={invoiceNotes} onChange={setInvoiceNotes} placeholder="طريقة التسليم أو أي ملاحظات" />
              <div className="invoice-summary"><div><span>إجمالي الأصناف</span><b>{money(invoiceSubtotal)}</b></div><div><span>الخصم</span><b>{money(invoiceDiscountValue)}</b></div><div><span>الضريبة</span><b>{money(Math.max(0, invoiceSubtotal - invoiceDiscountValue) * invoiceTaxValue / 100)}</b></div><div className="total-row"><span>الإجمالي النهائي</span><strong>{money(invoiceTotal)}</strong></div><div><span>المتبقي للتحصيل</span><b>{money(invoiceBalance)}</b></div></div>
            </div>}
            <div className="modal-actions"><button className="secondary-btn" onClick={() => setInvoiceModal(false)}>إلغاء</button><button className="primary-btn" onClick={saveInvoice}><Check size={17} /> حفظ الفاتورة</button></div>
          </section>
        </div>
      )}

      <footer className="footer">
        <span>
          © {new Date().getFullYear()} {COMPANY}
        </span>
        <span>
          <ClipboardList size={14} /> إدارة مخزون ومستلزمات التأريض
        </span>
      </footer>
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
  foot,
  warning = false,
}: {
  icon: React.ReactNode
  label: string
  value: string
  foot: string
  warning?: boolean
}) {
  return (
    <div className="stat-card">
      <div className={warning ? 'stat-icon warning' : 'stat-icon'}>
        {icon}
      </div>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      <small>{foot}</small>
    </div>
  )
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Boxes size={24} />
      </div>
      <b>{title}</b>
      <span>{detail}</span>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder = '',
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
      />
    </label>
  )
}

function quoteHtml(q: Quote) {
  const total = q.items.reduce(
    (s, x) => s + x.quantity * x.price,
    0
  )

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>عرض سعر ${q.number}</title>
<style>
body{font-family:Arial,sans-serif;padding:36px;color:#18232d}
h1{border-bottom:2px solid #18232d;padding-bottom:16px}
h2{font-size:16px;font-weight:normal}
table{width:100%;border-collapse:collapse;margin-top:24px}
th,td{border:1px solid #cbd2d8;padding:12px;text-align:right}
th{background:#f1f4f6}
.total{text-align:left;margin-top:24px;font-size:20px;font-weight:bold}
.meta{line-height:2}
</style>
</head>
<body>
<h1>${COMPANY}</h1>
<h2>عرض سعر</h2>
<div class="meta">
رقم العرض: ${q.number}<br>
العميل: ${escapeHtml(q.customer)}<br>
التاريخ: ${q.date}
</div>
<table>
<thead>
<tr>
<th>الكود</th>
<th>الصنف</th>
<th>الكمية</th>
<th>سعر الوحدة</th>
<th>الإجمالي</th>
</tr>
</thead>
<tbody>
${q.items
  .map(
    x => `<tr>
<td>${escapeHtml(x.code)}</td>
<td>${escapeHtml(x.name)}</td>
<td>${x.quantity}</td>
<td>${x.price.toFixed(2)} ج.م</td>
<td>${(x.quantity * x.price).toFixed(2)} ج.م</td>
</tr>`
  )
  .join('')}
</tbody>
</table>
<div class="total">الإجمالي: ${total.toFixed(2)} جنيه مصري</div>
</body>
</html>`
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c =>
    ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[c] as string
  )
}

function invoiceTotalFor(invoice: Invoice) {
  const subtotal = invoice.items.reduce((sum, item) => sum + item.quantity * item.price, 0)
  return Math.max(0, subtotal - invoice.discount) * (1 + invoice.tax / 100)
}

function invoiceHtml(invoice: Invoice) {
  const subtotal = invoice.items.reduce((sum, item) => sum + item.quantity * item.price, 0)
  const total = invoiceTotalFor(invoice)
  const balance = Math.max(0, total - invoice.paidAmount)
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>فاتورة ${invoice.number}</title>
  <style>
  *{box-sizing:border-box}body{font-family:Arial,sans-serif;padding:32px;color:#17263d;max-width:900px;margin:auto}
  .head{display:flex;justify-content:space-between;align-items:center;gap:18px;border-bottom:3px solid #244d80;padding-bottom:18px}
  .brand-lockup{display:flex;align-items:center;gap:16px;min-width:0}.company-logo{width:105px;height:85px;object-fit:contain;flex-shrink:0}
  h1{font-size:25px;margin:0 0 8px;color:#173456}h2{color:#245b94;margin:22px 0 12px}
  .tag{background:#eaf1ff;padding:10px 14px;border-radius:8px;font-weight:bold}
  .meta{line-height:2.1;margin:20px 0}.meta b{display:inline-block;min-width:110px}
  table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border:1px solid #d7e0eb;padding:11px;text-align:right}
  th{background:#edf3fa}tfoot td{font-weight:bold}.totals{width:330px;margin:20px 0 0 auto}.totals div{display:flex;justify-content:space-between;padding:8px;border-bottom:1px solid #e5eaf1}
  .grand{font-size:19px;color:#173456;font-weight:bold;background:#edf3fa}.note{margin-top:22px;padding:12px;background:#f7f9fc;white-space:pre-wrap}
  .foot{margin-top:48px;padding-top:14px;border-top:1px solid #d7e0eb;color:#66758c;font-size:12px;text-align:center}
  @media print{body{padding:0}.no-print{display:none}}
  </style></head><body>
  <div class="head"><div class="brand-lockup"><img class="company-logo" src="https://i.ibb.co/yB5yr1BD/IMG-5095.jpg" alt="لوجو شركة العربي" onerror="this.style.display='none'"><div><h1>${COMPANY}</h1><div>أنظمة التأريض والحماية من الصواعق</div></div></div><div class="tag">فاتورة بيع</div></div>
  <h2>فاتورة رقم ${escapeHtml(invoice.number)}</h2>
  <div class="meta"><div><b>العميل:</b> ${escapeHtml(invoice.customer)}</div><div><b>الهاتف:</b> ${escapeHtml(invoice.phone || '—')}</div><div><b>تاريخ الفاتورة:</b> ${invoice.date}</div><div><b>تاريخ الاستحقاق:</b> ${escapeHtml(invoice.dueDate || '—')}</div><div><b>حالة السداد:</b> ${invoice.status === 'paid' ? 'مدفوعة' : invoice.status === 'partial' ? 'مدفوعة جزئيًا' : 'غير مدفوعة'}</div></div>
  <table><thead><tr><th>م</th><th>كود الصنف</th><th>الوصف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead><tbody>${invoice.items.map((item,index)=>`<tr><td>${index+1}</td><td>${escapeHtml(item.code)}</td><td>${escapeHtml(item.name)}</td><td>${item.quantity}</td><td>${money(item.price)}</td><td>${money(item.quantity*item.price)}</td></tr>`).join('')}</tbody></table>
  <div class="totals"><div><span>إجمالي الأصناف</span><b>${money(subtotal)}</b></div><div><span>الخصم</span><b>${money(invoice.discount)}</b></div><div><span>الضريبة (${invoice.tax}%)</span><b>${money(Math.max(0,subtotal-invoice.discount)*invoice.tax/100)}</b></div><div class="grand"><span>الإجمالي النهائي</span><b>${money(total)}</b></div><div><span>المدفوع</span><b>${money(invoice.paidAmount)}</b></div><div><span>المتبقي</span><b>${money(balance)}</b></div></div>
  ${invoice.notes ? `<div class="note"><b>ملاحظات:</b> ${escapeHtml(invoice.notes)}</div>` : ''}
  <div class="foot">شكرًا لتعاملكم مع ${COMPANY}</div><script>window.onload=()=>window.print()</script></body></html>`
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setUser(data.session?.user ?? null); setChecking(false) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { setUser(session?.user ?? null); setChecking(false) })
    return () => listener.subscription.unsubscribe()
  }, [])
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setMessage('')
    const result = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password })
    setBusy(false)
    if (result.error) setMessage(result.error.message)
    else if (mode === 'signup' && !result.data.session) setMessage('تم إنشاء الحساب. راجع بريدك الإلكتروني لتأكيده، ثم سجّل الدخول.')
    else setMessage('تم تسجيل الدخول بنجاح.')
  }
  if (checking) return <div className="auth-page"><div className="auth-card">جارٍ التحقق من تسجيل الدخول...</div></div>
  if (user) return <InventoryApp user={user} />
  return <div className="auth-page" dir="rtl"><form className="auth-card" onSubmit={submit}>
    <div className="auth-mark"><Boxes size={30} /></div>
    <h1>العربي لأنظمة التأريض والحماية من الصواعق</h1>
    <p>سجّل الدخول للوصول إلى المخزون والفواتير وعروض الأسعار من أي جهاز.</p>
    <label>البريد الإلكتروني<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" /></label>
    <label>كلمة المرور<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={6} required value={password} onChange={e => setPassword(e.target.value)} placeholder="6 أحرف على الأقل" /></label>
    {message && <div className="auth-message">{message}</div>}
    <button className="primary-btn auth-submit" disabled={busy}>{busy ? 'جارٍ التنفيذ...' : mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}</button>
    <button type="button" className="text-button auth-toggle" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage('') }}>{mode === 'login' ? 'أول مرة؟ أنشئ حسابًا' : 'لديك حساب؟ سجّل الدخول'}</button>
  </form></div>
}
