

import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import {
  Boxes, LayoutDashboard, Package, FileText, Search, Plus, Pencil,
  Trash2, AlertTriangle, TrendingUp, X, Printer, Check, ClipboardList, Receipt, CircleDollarSign, Wallet, ArrowDownLeft, ArrowUpRight, Download,
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

type CashEntry = { id: string; kind: 'in' | 'out'; amount: number; category: string; note: string; date: string }
type StockMovement = { id: string; productId: string; productName: string; kind: 'in' | 'out'; quantity: number; reason: string; reference: string; date: string }
type Tab = 'dashboard' | 'products' | 'quotes' | 'invoices' | 'cash'

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
  const [invoices, setInvoices] = useState<Invoice[]>(() => load('alarabi-invoices', []))
  const [cashEntries, setCashEntries] = useState<CashEntry[]>(() => load('alarabi-cash', []))
  const [stockMovements, setStockMovements] = useState<StockMovement[]>(() => load('alarabi-stock-movements', []))
  const [cashModal, setCashModal] = useState(false)
  const [cashKind, setCashKind] = useState<'in' | 'out'>('in')
  const [cashAmount, setCashAmount] = useState('')
  const [cashCategory, setCashCategory] = useState('')
  const [cashNote, setCashNote] = useState('')
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
        { key: 'cash', localKey: 'alarabi-cash', fallback: [] as CashEntry[], setter: setCashEntries },
        { key: 'stock-movements', localKey: 'alarabi-stock-movements', fallback: [] as StockMovement[], setter: setStockMovements },
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

  useEffect(() => {
    if (!cloudLoaded) return
    localStorage.setItem('alarabi-cash', JSON.stringify(cashEntries))
    void supabase.from('app_state').upsert({ owner_id: user.id, state_key: 'cash', state_value: cashEntries, updated_at: new Date().toISOString() }, { onConflict: 'owner_id,state_key' }).then(({ error }) => { if (error) setCloudError('مشكلة في حفظ حركة الخزنة سحابيًا: ' + error.message) })
  }, [cashEntries, cloudLoaded, user.id])

  const cashIn = cashEntries.filter(e => e.kind === 'in').reduce((s, e) => s + e.amount, 0)
  const cashOut = cashEntries.filter(e => e.kind === 'out').reduce((s, e) => s + e.amount, 0)
  const cashBalance = cashIn - cashOut

  const exportBackup = () => {
    const backup = {
      company: COMPANY,
      exportedAt: new Date().toISOString(),
      version: 1,
      data: { products, quotes, invoices, cashEntries },
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'alarabi-backup-' + today() + '.json'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    setNotice('تم تجهيز نسخة احتياطية من البيانات الحالية')
  }
  const restoreBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text())
      const data = parsed?.data
      if (
        !data ||
        !Array.isArray(data.products) ||
        !Array.isArray(data.quotes) ||
        !Array.isArray(data.invoices) ||
        !Array.isArray(data.cashEntries)
      ) {
        setNotice('ملف النسخة الاحتياطية غير صالح أو ناقص')
        return
      }
      const confirmed = window.confirm('تنبيه: استرجاع النسخة سيستبدل بيانات الأصناف وعروض الأسعار والفواتير والخزنة الحالية. هل حفظت نسخة من البيانات الحالية وتريد المتابعة؟')
      if (!confirmed) return
      setProducts(data.products)
      setQuotes(data.quotes)
      setInvoices(data.invoices)
      setCashEntries(data.cashEntries)
      setNotice('تم تحميل النسخة الاحتياطية. جاري حفظ البيانات')
    } catch {
      setNotice('تعذر قراءة الملف. تأكد أنه ملف نسخة احتياطية صحيح بصيغة JSON')
    } finally {
      event.target.value = ''
    }
  }

  const addCashEntry = () => {
    const amount = Number(cashAmount)
    if (!Number.isFinite(amount) || amount <= 0 || !cashCategory.trim()) { setNotice('اكتب مبلغ صحيح وحدد البند'); return }
    setCashEntries(old => [{ id: crypto.randomUUID(), kind: cashKind, amount, category: cashCategory.trim(), note: cashNote.trim(), date: today() }, ...old])
    setCashAmount(''); setCashCategory(''); setCashNote(''); setCashModal(false)
    setNotice(cashKind === 'in' ? 'تم تسجيل المبلغ الداخل' : 'تم تسجيل المبلغ الخارج')
  }
  const deleteCashEntry = (entry: CashEntry) => {
    if (!window.confirm('حذف حركة الخزنة بقيمة ' + money(entry.amount) + '؟')) return
    setCashEntries(old => old.filter(e => e.id !== entry.id))
  }

  useEffect(() => {
    if (!cloudLoaded) return
    localStorage.setItem('alarabi-stock-movements', JSON.stringify(stockMovements))
    void supabase.from('app_state').upsert({ owner_id: user.id, state_key: 'stock-movements', state_value: stockMovements, updated_at: new Date().toISOString() }, { onConflict: 'owner_id,state_key' }).then(({ error }) => { if (error) setCloudError('مشكلة في حفظ سجل حركة المخزون: ' + error.message) })
  }, [stockMovements, cloudLoaded, user.id])

  const inventoryValue = products.reduce(
    (sum, p) => sum + p.quantity * p.price,
    0
  )

  const lowStock = products.filter(p => p.quantity <= p.minStock)
  const totalInvoiceSales = invoices.reduce((sum, invoice) => sum + invoiceTotalFor(invoice), 0)
  const totalCollected = invoices.reduce((sum, invoice) => sum + Math.min(invoiceTotalFor(invoice), Math.max(0, invoice.paidAmount || 0)), 0)
  const customerBalances = Math.max(0, totalInvoiceSales - totalCollected)
  const unpaidInvoices = invoices.filter(invoice => invoiceTotalFor(invoice) > (invoice.paidAmount || 0))
  const paidInvoiceCount = invoices.filter(invoice => invoiceTotalFor(invoice) <= (invoice.paidAmount || 0)).length

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
    setStockMovements(old => [
      ...Array.from(quantitiesByProduct.entries()).map(([productId, quantity]) => {
        const product = products.find(item => item.id === productId)!
        return { id: crypto.randomUUID(), productId, productName: product.name, kind: 'out' as const, quantity, reason: 'بيع بفاتورة', reference: invoice.number, date: today() }
      }),
      ...old,
    ])
    setInvoices(old => [invoice, ...old])
    setInvoiceModal(false)
    setTab('invoices')
    resetInvoiceDraft()
    setNotice('تم حفظ الفاتورة وخصم الكميات من المخزون بنجاح')
  }

  const deleteInvoice = (invoice: Invoice) => {
    if (!window.confirm(`متأكد إنك عايز تحذف الفاتورة ${invoice.number}؟ سيتم حذفها وإرجاع كمياتها للمخزون.`)) return
    const returned = new Map<string, number>()
    for (const row of invoice.items || []) {
      returned.set(row.productId, (returned.get(row.productId) || 0) + row.quantity)
    }
    setProducts(old => old.map(product => ({
      ...product,
      quantity: product.quantity + (returned.get(product.id) || 0),
    })))
    setStockMovements(old => [
      ...Array.from(returned.entries()).map(([productId, quantity]) => ({
        id: crypto.randomUUID(),
        productId,
        productName: invoice.items.find(row => row.productId === productId)?.name || products.find(product => product.id === productId)?.name || 'صنف',
        kind: 'in' as const,
        quantity,
        reason: 'إرجاع عند حذف فاتورة',
        reference: invoice.number,
        date: today(),
      })),
      ...old,
    ])
    setInvoices(old => old.filter(item => item.id !== invoice.id))
    setNotice('تم حذف الفاتورة وإرجاع كمياتها للمخزون')
  }

  const deleteQuote = (quote: Quote) => {
    if (!window.confirm(`متأكد إنك عايز تحذف عرض السعر ${quote.number}؟`)) return
    setQuotes(old => old.filter(item => item.id !== quote.id))
    setNotice('تم حذف عرض السعر')
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

          <button className={tab === 'cash' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('cash')}><Wallet size={19} /> الخزنة والحركة المالية</button>

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
                  : tab === 'quotes' ? 'عروض الأسعار' : tab === 'cash' ? 'الخزنة والحركة المالية' : 'الفواتير'}
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

            <section className="stats-grid financial-stats">
              <Stat icon={<Receipt />} label="إجمالي الفواتير" value={money(totalInvoiceSales)} foot={invoices.length + ' فاتورة مسجلة'} />
              <Stat icon={<CircleDollarSign />} label="المبالغ المحصلة" value={money(totalCollected)} foot={paidInvoiceCount + ' فاتورة مسددة بالكامل'} />
              <Stat icon={<AlertTriangle />} label="مستحقات العملاء" value={money(customerBalances)} foot={unpaidInvoices.length + ' فاتورة عليها رصيد'} warning={customerBalances > 0} />
              <Stat icon={<Wallet />} label="رصيد الخزنة المسجل" value={money(cashBalance)} foot="من حركات الخزنة اليدوية فقط" />
            </section>

            <section className="panel backup-panel">
              <div className="panel-head">
                <div>
                  <h3>نسخة احتياطية من بيانات الشركة</h3>
                  <p>نزّل نسخة من الأصناف وعروض الأسعار والفواتير والخزنة، أو استرجع ملفًا سابقًا. الاسترجاع يستبدل البيانات الحالية.</p>
                </div>
                <div className="backup-actions">
                  <button className="primary-button" onClick={exportBackup}>
                    <Download size={17} /> تنزيل نسخة احتياطية
                  </button>
                  <button className="secondary-button" onClick={() => document.getElementById('backup-restore-input')?.click()}>
                    استرجاع نسخة
                  </button>
                  <input id="backup-restore-input" type="file" accept=".json,application/json" hidden onChange={restoreBackup} />
                </div>
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

        {tab === 'cash' && (
          <>
            <section className="stats-grid">
              <Stat icon={<ArrowDownLeft />} label="إجمالي المبالغ الداخلة" value={money(cashIn)} foot="كل المقبوضات المسجلة" />
              <Stat icon={<ArrowUpRight />} label="إجمالي المبالغ الخارجة" value={money(cashOut)} foot="كل المصروفات المسجلة" warning={cashOut > cashIn} />
              <Stat icon={<Wallet />} label="صافي الخزنة" value={money(cashBalance)} foot="الداخل ناقص الخارج" warning={cashBalance < 0} />
              <Stat icon={<ClipboardList />} label="عدد الحركات" value={String(cashEntries.length)} foot="حركة مالية مسجلة" />
            </section>
            <section className="panel"><div className="panel-head products-head"><div><h3>حركة الخزنة</h3><p>سجّل أي مبلغ داخل أو خارج وتابع الرصيد</p></div><button className="primary-btn" onClick={() => { setCashKind('in'); setCashModal(true) }}><Plus size={17} /> تسجيل حركة مالية</button></div>
            {cashEntries.length ? <div className="table-wrap"><table><thead><tr><th>التاريخ</th><th>النوع</th><th>البند</th><th>ملاحظات</th><th>المبلغ</th><th>إجراء</th></tr></thead><tbody>{cashEntries.map(entry => <tr key={entry.id}><td>{entry.date}</td><td><span className={entry.kind === 'in' ? 'pill success' : 'pill danger'}>{entry.kind === 'in' ? 'مبلغ داخل' : 'مبلغ خارج'}</span></td><td className="product-cell">{entry.category}</td><td>{entry.note || '—'}</td><td><strong>{entry.kind === 'in' ? '+' : '−'} {money(entry.amount)}</strong></td><td><button className="icon-btn delete" title="حذف الحركة" aria-label="حذف الحركة" onClick={() => deleteCashEntry(entry)}><Trash2 size={16} /></button></td></tr>)}</tbody></table></div> : <Empty title="لسه مفيش حركات مالية" detail="سجّل أول مبلغ داخل أو خارج لمتابعة الخزنة." />}
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
                      <button className="icon-btn delete" aria-label="حذف الفاتورة" title="حذف الفاتورة" onClick={() => deleteInvoice(inv)}><Trash2 size={16} /></button>
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
                    <button className="icon-btn delete" aria-label="حذف عرض السعر" title="حذف عرض السعر" onClick={() => deleteQuote(q)}>
                      <Trash2 size={17} />
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

      {cashModal && (
        <div className="modal-backdrop" onClick={() => setCashModal(false)}><section className="modal" onClick={e => e.stopPropagation()}><div className="modal-head"><div><h2>تسجيل حركة مالية</h2><p>سجّل المقبوضات والمصروفات</p></div><button className="icon-btn" onClick={() => setCashModal(false)}><X /></button></div><div className="form-grid"><label className="field"><span>نوع الحركة</span><select value={cashKind} onChange={e => setCashKind(e.target.value as 'in' | 'out')}><option value="in">مبلغ داخل</option><option value="out">مبلغ خارج (مصروف)</option></select></label><Field label="المبلغ بالجنيه *" type="number" value={cashAmount} onChange={setCashAmount} placeholder="0.00" /><Field label="البند *" value={cashCategory} onChange={setCashCategory} placeholder="مثال: تحصيل عميل أو مصروف نقل" /><Field label="ملاحظات" value={cashNote} onChange={setCashNote} placeholder="تفاصيل إضافية (اختياري)" /></div><div className="modal-actions"><button className="secondary-btn" onClick={() => setCashModal(false)}>إلغاء</button><button className="primary-btn" onClick={addCashEntry}><Check size={17} /> حفظ الحركة</button></div></section></div>
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
  const subtotal = q.items.reduce((sum, item) => sum + item.quantity * item.price, 0)
  const dateLabel = new Date(q.date + 'T12:00:00').toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
  const logoUrl = 'https://i.ibb.co/yB5yr1BD/IMG-5095.jpg'
  const rows = q.items.map((item, index) =>
    '<tr><td class="center">' + (index + 1) + '</td><td><span class="code">' + escapeHtml(item.code) + '</span></td><td class="item">' + escapeHtml(item.name) + '</td><td class="center">' + item.quantity + '</td><td class="money">' + item.price.toFixed(2) + ' ج.م</td><td class="money">' + (item.quantity * item.price).toFixed(2) + ' ج.م</td></tr>'
  ).join('')
  return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>عرض سعر ' + escapeHtml(q.number) + '</title><style>' +
  ':root{--navy:#103b60;--blue:#155581;--gold:#d6a84f;--ink:#1d3448;--muted:#65798b;--line:#d8e3ec;--pale:#f0f5f9}' +
  '*{box-sizing:border-box}html{background:#edf1f5}body{margin:0;padding:24px;background:#edf1f5;color:var(--ink);font:13px/1.7 Tahoma,Arial,sans-serif}.actions{max-width:900px;margin:0 auto 14px;display:flex;gap:8px;justify-content:flex-end}.actions button{border:0;border-radius:8px;padding:11px 18px;background:var(--navy);color:#fff;font:inherit;font-weight:bold;cursor:pointer}.actions .secondary{background:#fff;color:var(--navy);border:1px solid var(--line)}' +
  '.sheet{max-width:900px;min-height:1120px;margin:auto;background:#fff;position:relative;overflow:hidden;box-shadow:0 12px 38px #18344b18}.top-stripe{height:8px;background:linear-gradient(90deg,var(--navy) 0%,var(--blue) 68%,var(--gold) 100%)}.header{padding:28px 34px 23px;display:flex;align-items:center;justify-content:space-between;gap:20px;border-bottom:1px solid var(--line)}.brand{display:flex;align-items:center;gap:15px;min-width:0}.logo{width:90px;height:78px;object-fit:contain}.company{font-size:21px;line-height:1.5;font-weight:800;color:var(--navy);margin:0}.subtitle{font-size:10px;letter-spacing:.5px;color:var(--muted)}.tagline{font-size:11px;color:var(--blue);margin-top:5px}.doc-chip{background:var(--navy);color:white;border-radius:10px;padding:13px 19px;text-align:center;min-width:150px;box-shadow:0 5px 12px #103b6020}.doc-chip strong{display:block;font-size:23px;line-height:1.4}.doc-chip span{font-size:10px;letter-spacing:1.4px;color:#dce9f3}' +
  '.intro{padding:25px 34px 15px;display:flex;align-items:end;justify-content:space-between;gap:15px}.intro h2{margin:0;color:var(--navy);font-size:26px}.intro p{margin:5px 0 0;color:var(--muted);font-size:12px}.number{text-align:left;color:var(--muted);font-size:11px}.number b{display:block;color:var(--blue);font-size:16px;direction:ltr}.details{padding:0 34px 20px;display:grid;grid-template-columns:1fr 1fr;gap:13px}.detail{background:var(--pale);border:1px solid #e3ebf1;border-radius:10px;padding:14px 16px}.detail h3{margin:0 0 9px;font-size:12px;color:var(--blue)}.detail-row{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid #dbe5ed}.detail-row:last-child{border-bottom:0}.detail-row span{color:var(--muted)}.detail-row b{color:var(--navy);text-align:left;overflow-wrap:anywhere}' +
  '.table-wrap{padding:0 34px}table{width:100%;border-collapse:separate;border-spacing:0;font-size:11px;border:1px solid var(--line);border-radius:9px;overflow:hidden}thead{display:table-header-group}th{background:var(--navy);color:#fff;text-align:right;padding:12px 9px;font-weight:700}td{padding:12px 9px;border-bottom:1px solid var(--line);background:#fff}tbody tr:nth-child(even) td{background:#f7fafc}tbody tr:last-child td{border-bottom:0}.center{text-align:center;white-space:nowrap}.money{white-space:nowrap;font-variant-numeric:tabular-nums}.code{direction:ltr;display:inline-block;color:var(--blue);font-size:10px;font-weight:bold}.item{font-weight:700}' +
  '.lower{padding:20px 34px 0;display:grid;grid-template-columns:1fr 1.08fr;gap:18px;align-items:stretch}.notes,.totals{border:1px solid var(--line);border-radius:10px;overflow:hidden}.notes{background:#f8fafc;padding:16px}.notes h3{margin:0 0 9px;color:var(--navy);font-size:14px}.notes p{margin:0 0 7px;color:var(--muted);font-size:11px}.notes ul{margin:8px 0 0;padding-right:18px;color:var(--ink);font-size:11px}.totals{padding:8px 15px}.sum-row{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid #e8eef3}.sum-row span{color:var(--muted)}.sum-row b{white-space:nowrap;font-variant-numeric:tabular-nums}.sum-row.final{margin:8px -8px -1px;padding:14px 12px;background:var(--navy);color:#fff;border-radius:7px}.sum-row.final span,.sum-row.final b{color:#fff;font-size:15px;font-weight:800}.terms{padding:18px 34px 0;font-size:10px;color:var(--muted)}.terms strong{color:var(--navy)}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:80px;padding:35px 55px 28px}.sign{border-top:1px dashed #8da2b3;text-align:center;padding-top:9px;color:var(--navy);font-size:11px;font-weight:bold;min-height:43px}.footer{background:var(--navy);color:#eaf2f8;padding:16px 34px;display:flex;justify-content:space-between;align-items:center;gap:15px;font-size:10px}.footer strong{color:#fff;font-size:12px}.footer .motto{color:#f0c66e;font-size:12px;font-weight:bold}' +
  '@page{size:A4;margin:10mm}@media print{html,body{background:#fff;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.actions{display:none!important}.sheet{max-width:none;min-height:0;box-shadow:none}.header,.details,.table-wrap,.lower,.terms,.signatures{break-inside:avoid}.footer{break-inside:avoid}}@media(max-width:620px){body{padding:8px}.header{padding:20px 16px;align-items:flex-start;flex-direction:column}.logo{width:65px;height:62px}.company{font-size:16px}.doc-chip{align-self:flex-end}.intro{padding:20px 16px 12px}.intro h2{font-size:22px}.details{padding:0 16px 16px;grid-template-columns:1fr}.table-wrap{padding:0 10px;overflow-x:auto}table{min-width:570px}.lower{padding:16px;grid-template-columns:1fr}.terms{padding:12px 16px 0}.signatures{padding:28px 22px;gap:25px}.footer{padding:15px;flex-wrap:wrap}}' +
  '</style></head><body><div class="actions"><button onclick="window.print()">طباعة عرض السعر / حفظ PDF</button><button class="secondary" onclick="window.close()">إغلاق</button></div>' +
  '<main class="sheet"><div class="top-stripe"></div><header class="header"><div class="brand"><img class="logo" src="' + logoUrl + '" alt="شعار العربي" onerror="this.style.display=\'none\'"><div><h1 class="company">' + COMPANY + '</h1><div class="subtitle">EARTHING &amp; LIGHTNING PROTECTION</div><div class="tagline">أمان · حماية · استمرارية</div></div></div><div class="doc-chip"><strong>عرض سعر</strong><span>QUOTATION</span></div></header>' +
  '<section class="intro"><div><h2>عرض سعر</h2><p>نشكركم على اهتمامكم بالتعامل معنا، ويسعدنا تقديم عرض السعر التالي.</p></div><div class="number">رقم العرض<b>' + escapeHtml(q.number) + '</b></div></section>' +
  '<section class="details"><div class="detail"><h3>بيانات العميل</h3><div class="detail-row"><span>اسم العميل / الشركة</span><b>' + escapeHtml(q.customer) + '</b></div><div class="detail-row"><span>رقم الهاتف</span><b>—</b></div><div class="detail-row"><span>العنوان</span><b>—</b></div><div class="detail-row"><span>تاريخ العرض</span><b>' + dateLabel + '</b></div></div><div class="detail"><h3>بيانات العرض</h3><div class="detail-row"><span>رقم العرض</span><b>' + escapeHtml(q.number) + '</b></div><div class="detail-row"><span>تاريخ الإصدار</span><b>' + dateLabel + '</b></div><div class="detail-row"><span>مدة الصلاحية</span><b>7 أيام</b></div><div class="detail-row"><span>طريقة الدفع</span><b>نقدًا / تحويل بنكي</b></div></div></section>' +
  '<div class="table-wrap"><table><thead><tr><th class="center">م</th><th>كود الصنف</th><th>الصنف / الوصف</th><th class="center">الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
  '<section class="lower"><div class="notes"><h3>ملاحظات وشروط</h3><p>يرجى مراجعة تفاصيل الأصناف والكميات والأسعار قبل اعتماد العرض.</p><ul><li>الأسعار تشمل التوريد فقط ما لم يُذكر خلاف ذلك.</li><li>مدة التوريد حسب التوفر في المخزون.</li><li>الضمان حسب شروط الشركة المصنعة.</li><li>هذا العرض ساري لمدة 7 أيام من تاريخ الإصدار.</li></ul></div><div class="totals"><div class="sum-row"><span>إجمالي المبلغ قبل الخصم</span><b>' + subtotal.toFixed(2) + ' ج.م</b></div><div class="sum-row"><span>الخصم</span><b>0.00 ج.م</b></div><div class="sum-row"><span>إجمالي المبلغ بعد الخصم</span><b>' + subtotal.toFixed(2) + ' ج.م</b></div><div class="sum-row"><span>الضريبة (0%)</span><b>0.00 ج.م</b></div><div class="sum-row final"><span>المبلغ الإجمالي</span><b>' + subtotal.toFixed(2) + ' ج.م</b></div></div></section>' +
  '<div class="terms"><strong>تنويه:</strong> يتم اعتماد الطلب بعد موافقة العميل على الكميات والأسعار وشروط التوريد.</div><section class="signatures"><div class="sign">توقيع العميل</div><div class="sign">إدارة الشركة / الختم</div></section><footer class="footer"><div><strong>' + COMPANY + '</strong><br>القليوبية - مصر</div><div>للاستفسار وطلب الأسعار<br>01012345678</div><div>البريد الإلكتروني<br>info@alarabi-eg.com</div><div class="motto">معاً نحو بيئة أكثر أماناً</div></footer></main></body></html>'
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
  const taxAmount = Math.max(0, subtotal - invoice.discount) * invoice.tax / 100
  const statusLabel = invoice.status === 'paid' ? 'مدفوعة' : invoice.status === 'partial' ? 'مدفوعة جزئيًا' : 'غير مدفوعة'
  const dateLabel = new Date(invoice.date + 'T12:00:00').toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
  const dueDateLabel = invoice.dueDate
    ? new Date(invoice.dueDate + 'T12:00:00').toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—'
  const logoUrl = 'https://i.ibb.co/yB5yr1BD/IMG-5095.jpg'
  const rows = invoice.items.map((item, index) =>
    '<tr><td class="num">' + (index + 1) + '</td><td><span class="item-code">' + escapeHtml(item.code) + '</span></td><td><div class="item-name">' + escapeHtml(item.name) + '</div></td><td class="num">' + item.quantity + '</td><td class="amount">' + money(item.price) + '</td><td class="amount">' + money(item.quantity * item.price) + '</td></tr>'
  ).join('')
  const noteHtml = invoice.notes
    ? '<p>' + escapeHtml(invoice.notes) + '</p>'
    : '<p class="notes-empty">لا توجد ملاحظات مضافة.</p>'
  const statusColor = invoice.status === 'paid' ? '#e8f5ed' : invoice.status === 'partial' ? '#fff3dd' : '#fcebea'
  const statusTextColor = invoice.status === 'paid' ? '#26744d' : invoice.status === 'partial' ? '#8c641c' : '#a23e39'
  return '<!doctype html>' +
'<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
'<title>فاتورة ' + escapeHtml(invoice.number) + ' — ' + COMPANY + '</title><style>' +
':root{--navy:#173653;--blue:#245b80;--pale:#eef4f8;--line:#d9e2e9;--ink:#253746;--muted:#647787}' +
'*{box-sizing:border-box}html{background:#eef1f4}body{font-family:Tahoma,Arial,sans-serif;color:var(--ink);margin:0;padding:28px;background:#eef1f4;font-size:13px;line-height:1.7}' +
'.sheet{width:100%;max-width:850px;min-height:1050px;margin:0 auto;background:#fff;padding:42px 46px;box-shadow:0 8px 32px rgba(20,43,61,.12);position:relative;overflow:hidden}' +
'.accent{height:7px;background:linear-gradient(90deg,#173653,#3c779a,#c6a66b);position:absolute;top:0;right:0;left:0}' +
'.head{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:8px 0 24px;border-bottom:1px solid var(--line)}.brand-lockup{display:flex;align-items:center;gap:16px;min-width:0}.company-logo{width:104px;height:86px;object-fit:contain;flex-shrink:0}' +
'.company-name{font-size:22px;line-height:1.55;font-weight:800;color:var(--navy);margin:0}.company-sub{font-size:11px;color:var(--muted);letter-spacing:.4px}.doc-badge{min-width:145px;text-align:center;background:var(--pale);border:1px solid #dce7ee;border-radius:10px;padding:12px 16px}.doc-badge strong{display:block;font-size:20px;color:var(--navy)}.doc-badge span{font-size:11px;color:var(--muted)}' +
'.title-row{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;margin:27px 0 18px}h2{font-size:23px;color:var(--navy);margin:0}.invoice-no{font-size:12px;color:var(--muted)}.invoice-no b{color:var(--blue);font-size:15px;direction:ltr;display:inline-block}' +
'.details{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:0 0 24px}.detail-card{border:1px solid var(--line);border-radius:9px;padding:13px 15px;min-width:0}.detail-card h3{margin:0 0 7px;font-size:11px;color:var(--muted);font-weight:700}.detail-card .value{font-size:14px;font-weight:700;color:var(--navy);overflow-wrap:anywhere}.detail-card .subvalue{font-size:11px;color:var(--muted);margin-top:3px}.section-title{font-size:13px;color:var(--navy);font-weight:800;margin:0 0 9px}' +
'table{width:100%;border-collapse:separate;border-spacing:0;margin-top:8px;font-size:12px}thead{display:table-header-group}th{background:var(--navy);color:#fff;font-weight:700;padding:12px 10px;text-align:right;white-space:nowrap}th:first-child{border-radius:0 7px 0 0}th:last-child{border-radius:7px 0 0 0}td{padding:11px 10px;border-bottom:1px solid var(--line);vertical-align:top}tbody tr:nth-child(even) td{background:#f8fafb}.num{text-align:center;width:38px;color:var(--muted)}.amount{white-space:nowrap;font-variant-numeric:tabular-nums}.item-name{font-weight:700;color:var(--ink)}.item-code{font-size:10px;color:var(--muted);direction:ltr;display:inline-block}' +
'.bottom-grid{display:grid;grid-template-columns:minmax(0,1fr) 285px;gap:24px;align-items:start;margin-top:23px}.notes{border:1px solid var(--line);border-radius:9px;padding:13px 14px;min-height:94px}.notes h3{margin:0 0 6px;font-size:12px;color:var(--navy)}.notes p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--muted)}.notes-empty{color:#8a99a5;font-size:11px}' +
'.totals{border:1px solid var(--line);border-radius:10px;padding:8px 13px}.total-line{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid #edf1f4}.total-line:last-child{border-bottom:0}.total-line span{color:var(--muted)}.total-line b{font-weight:700;color:var(--ink);white-space:nowrap}.total-line.grand{margin:4px -5px;padding:12px 8px;background:var(--pale);border-radius:7px}.total-line.grand span,.total-line.grand b{color:var(--navy);font-weight:800;font-size:15px}.total-line.balance b{color:' + (balance > 0 ? '#9b5b22' : '#26744d') + '}' +
'.status{display:inline-block;border-radius:30px;padding:3px 10px;font-size:11px;font-weight:700;background:' + statusColor + ';color:' + statusTextColor + '}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:45px;margin-top:42px}.signature{text-align:center;padding-top:10px;border-top:1px solid #aab7c1;color:var(--muted);font-size:11px}.footer{margin-top:36px;padding-top:13px;border-top:1px solid var(--line);text-align:center;color:var(--muted);font-size:10px}.footer strong{display:block;color:var(--navy);font-size:12px;margin-bottom:3px}' +
'.actions{max-width:850px;margin:0 auto 14px;display:flex;justify-content:flex-end;gap:8px}.actions button{font:inherit;border:0;border-radius:7px;padding:10px 16px;cursor:pointer;background:var(--navy);color:white}.actions .secondary{background:white;color:var(--navy);border:1px solid var(--line)}' +
'@page{size:A4;margin:12mm}@media print{html,body{background:#fff;padding:0;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.actions{display:none!important}.sheet{width:100%;max-width:none;min-height:0;margin:0;padding:8mm 7mm;box-shadow:none;overflow:visible}.head,.details,.bottom-grid,.signatures,.footer{break-inside:avoid}tr{break-inside:avoid}}' +
'@media(max-width:600px){body{padding:10px}.sheet{padding:28px 18px;min-height:0}.head{align-items:flex-start;flex-direction:column}.brand-lockup{gap:10px}.company-logo{width:72px;height:66px}.company-name{font-size:17px}.doc-badge{align-self:flex-end}.details{grid-template-columns:1fr 1fr;gap:7px}.detail-card{padding:10px}.bottom-grid{grid-template-columns:1fr}.signatures{gap:20px}table{font-size:10px}th,td{padding:8px 5px}}' +
'</style></head><body><div class="actions"><button onclick="window.print()">طباعة الفاتورة / حفظ PDF</button><button class="secondary" onclick="window.close()">إغلاق</button></div>' +
'<main class="sheet"><div class="accent"></div><header class="head"><div class="brand-lockup"><img class="company-logo" src="' + logoUrl + '" alt="لوجو شركة العربي" onerror="this.style.display=\'none\'"><div><h1 class="company-name">' + COMPANY + '</h1><div class="company-sub">EARTHING &amp; LIGHTNING PROTECTION</div></div></div><div class="doc-badge"><strong>فاتورة بيع</strong><span>INVOICE</span></div></header>' +
'<section class="title-row"><h2>فاتورة بيع</h2><div class="invoice-no">رقم الفاتورة<br><b>' + escapeHtml(invoice.number) + '</b></div></section>' +
'<section class="details"><div class="detail-card"><h3>بيانات العميل</h3><div class="value">' + escapeHtml(invoice.customer) + '</div><div class="subvalue">رقم الهاتف: ' + escapeHtml(invoice.phone || 'غير مسجل') + '</div></div>' +
'<div class="detail-card"><h3>بيانات الفاتورة</h3><div class="value">' + dateLabel + '</div><div class="subvalue">تاريخ الاستحقاق: ' + dueDateLabel + '</div><div class="subvalue">حالة السداد: <span class="status">' + statusLabel + '</span></div></div></section>' +
'<h3 class="section-title">تفاصيل الأصناف</h3><table><thead><tr><th class="num">م</th><th>كود الصنف</th><th>الوصف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead><tbody>' + rows + '</tbody></table>' +
'<section class="bottom-grid"><div class="notes"><h3>ملاحظات وشروط</h3>' + noteHtml + '</div><div class="totals">' +
'<div class="total-line"><span>إجمالي الأصناف</span><b>' + money(subtotal) + '</b></div><div class="total-line"><span>الخصم</span><b>' + money(invoice.discount) + '</b></div><div class="total-line"><span>الضريبة (' + invoice.tax + '%)</span><b>' + money(taxAmount) + '</b></div><div class="total-line grand"><span>الإجمالي النهائي</span><b>' + money(total) + '</b></div><div class="total-line"><span>المبلغ المدفوع</span><b>' + money(invoice.paidAmount) + '</b></div><div class="total-line balance"><span>المتبقي</span><b>' + money(balance) + '</b></div></div></section>' +
'<section class="signatures"><div class="signature">توقيع العميل / المستلم</div><div class="signature">توقيع وختم الشركة</div></section><footer class="footer"><strong>' + COMPANY + '</strong>شكرًا لثقتكم بنا — نتطلع إلى استمرار التعاون معكم</footer></main></body></html>'
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
