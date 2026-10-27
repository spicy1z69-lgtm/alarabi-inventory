

import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { getDesktopLocalSession, isDesktopApp, readDesktopState, writeDesktopState } from './lib/desktopStorage'

import * as XLSX from 'xlsx'
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
    costPrice: 0,
    minStock: 3,
  },
  {
    id: 'p2',
    code: 'LPS-002',
    name: 'مانعة صواعق رأسية',
    category: 'الحماية من الصواعق',
    quantity: 18,
    price: 1250,
    costPrice: 0,
    minStock: 5,
  },
  {
    id: 'p3',
    code: 'CAB-003',
    name: 'كابل نحاس للتأريض 35 مم',
    category: 'كابلات التأريض',
    quantity: 4,
    price: 950,
    costPrice: 0,
    minStock: 2,
  },
  {
    id: 'p4',
    code: 'CLP-004',
    name: 'مشبك تأريض نحاس',
    category: 'وصلات ومشابك',
    quantity: 2,
    price: 350,
    costPrice: 0,
    minStock: 3,
  },
  {
    id: 'p5',
    code: 'PIT-005',
    name: 'غرفة تفتيش لنظام التأريض',
    category: 'غرف التفتيش',
    quantity: 8,
    price: 480,
    costPrice: 0,
    minStock: 2,
  },
  {
    id: 'p6',
    code: 'GEM-006',
    name: 'مادة تحسين مقاومة التربة',
    category: 'مواد التأريض',
    quantity: 10,
    price: 720,
    costPrice: 0,
    minStock: 3,
  },
]

const money = (n: number) =>
  new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP',
    maximumFractionDigits: 2,
  }).format(n)

const today = () => {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

const load = <T,>(key: string, fallback: T): T => {
  try {
    const value = localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : fallback
  } catch {
    return fallback
  }
}

type CashEntry = { id: string; kind: 'in' | 'out'; amount: number; category: string; note: string; date: string; invoiceId?: string }
type StockMovement = { id: string; productId: string; productName: string; kind: 'in' | 'out'; quantity: number; reason: string; reference: string; date: string; quantityBefore?: number; quantityAfter?: number }
type Tab = 'dashboard' | 'products' | 'quotes' | 'invoices' | 'cash' | 'reports'

type AppUser = Pick<User, 'id'>

function InventoryApp({ user }: { user: AppUser }) {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [tutorialStep, setTutorialStep] = useState<number | null>(null)
  const [tutorialTargetRect, setTutorialTargetRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null)
  const tutorialSteps = [
    { title: 'مرحبًا بك في برنامج العربي', text: 'هذه جولة سريعة للتعرّف على أقسام البرنامج. اتبع السهم في كل خطوة لمعرفة مكان القسم ووظيفته. الجولة لا تعدّل بياناتك.', tab: 'dashboard' as Tab, target: null },
    { title: 'لوحة التحكم', text: 'تعرض لك ملخصًا عن المخزون والأصناف التي وصلت إلى حد التنبيه، بالإضافة إلى مؤشرات المبيعات والحركة المالية المسجلة.', tab: 'dashboard' as Tab, target: 'dashboard' },
    { title: 'الأصناف والمخزون', text: 'من هنا يمكنك إضافة صنف أو تعديل بياناته، مثل الكود والاسم والكمية وسعر البيع والتكلفة وحد التنبيه. راجع البيانات قبل الحفظ.', tab: 'products' as Tab, target: 'products' },
    { title: 'عروض الأسعار', text: 'أنشئ عرض سعر للعميل، وحدد الأصناف والكميات، ثم راجع الأسعار والإجمالي قبل حفظ العرض أو طباعته.', tab: 'quotes' as Tab, target: 'quotes' },
    { title: 'الفواتير', text: 'سجّل عملية البيع وبيانات العميل والأصناف والكميات والمبالغ المدفوعة. تأكد من الإجمالي والمبلغ المتبقي قبل اعتماد الفاتورة.', tab: 'invoices' as Tab, target: 'invoices' },
    { title: 'الخزنة والحركة المالية', text: 'سجّل المبالغ الواردة والمنصرفة، وحدد البند والمبلغ وأضف ملاحظة عند الحاجة. راجع قيمة الحركة قبل تسجيلها.', tab: 'cash' as Tab, target: 'cash' },
    { title: 'التقارير والتصدير', text: 'راجع التقارير وحدد الفترة المطلوبة، ويمكنك تصدير البيانات أو إنشاء نسخة احتياطية للاحتفاظ بها في مكان آمن.', tab: 'reports' as Tab, target: 'reports' },
    { title: 'الحساب والحفظ', text: 'يحفظ البرنامج البيانات على السحابة الخاصة بالحساب الحالي. بيانات حساب الضيف منفصلة عن بيانات حساب الإدارة. احتفظ ببيانات الدخول والنسخ الاحتياطية في مكان آمن.', tab: 'dashboard' as Tab, target: 'account' },
    { title: 'أصبحت جاهزًا للبدء', text: 'انتهت الجولة التعريفية. يمكنك فتح هذا الشرح في أي وقت من زر «شرح البرنامج» في القائمة الجانبية.', tab: 'dashboard' as Tab, target: null },
  ]
  useEffect(() => {
    // Do not block the local desktop workflow with the web onboarding overlay.
    if (isDesktopApp()) { setTutorialStep(null); return }
    const key = 'alarabi-tutorial-completed-' + user.id
    if (localStorage.getItem(key) !== 'yes') setTutorialStep(0)
  }, [user.id])
  useEffect(() => {
    if (tutorialStep === null) { setTutorialTargetRect(null); return }
    const target = tutorialSteps[tutorialStep]?.target
    if (!target) { setTutorialTargetRect(null); return }
    const updateRect = () => {
      const el = document.querySelector('[data-tutorial-target="' + target + '"]')
      if (!el) { setTutorialTargetRect(null); return }
      const r = el.getBoundingClientRect()
      setTutorialTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height })
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    }
    const timer = window.setTimeout(updateRect, 150)
    window.addEventListener('resize', updateRect)
    window.addEventListener('scroll', updateRect, true)
    return () => { window.clearTimeout(timer); window.removeEventListener('resize', updateRect); window.removeEventListener('scroll', updateRect, true) }
  }, [tutorialStep, tab])
  const finishTutorial = () => {
    localStorage.setItem('alarabi-tutorial-completed-' + user.id, 'yes')
    setTutorialStep(null)
  }
  const moveTutorial = (direction: 1 | -1) => {
    if (tutorialStep === null) return
    const next = tutorialStep + direction
    if (next < 0) return
    if (next >= tutorialSteps.length) { finishTutorial(); return }
    setTutorialStep(next)
    setTab(tutorialSteps[next].tab)
  }
  const [reportFrom, setReportFrom] = useState('')
  const [reportTo, setReportTo] = useState('')
  const [reportKind, setReportKind] = useState<'sales' | 'cash' | 'inventory'>('sales')
  const [cloudLoaded, setCloudLoaded] = useState(false)
  const [cloudError, setCloudError] = useState('')
  const [products, setProducts] = useState<Product[]>(() =>
    []
  )
  const [quotes, setQuotes] = useState<Quote[]>(() =>
    []
  )
  const [invoices, setInvoices] = useState<Invoice[]>(() => [])
  const [cashEntries, setCashEntries] = useState<CashEntry[]>(() => [])
  const [stockMovements, setStockMovements] = useState<StockMovement[]>(() => [])
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
    costPrice: '0',
    minStock: '2',
  })
  const [stockMovementModal, setStockMovementModal] = useState(false)
  const [movementProductId, setMovementProductId] = useState('')
  const [movementKind, setMovementKind] = useState<'in' | 'out'>('in')
  const [movementQuantity, setMovementQuantity] = useState('')
  const [movementReason, setMovementReason] = useState('')
  const [movementReference, setMovementReference] = useState('')
  const [movementKindFilter, setMovementKindFilter] = useState<'all' | 'in' | 'out'>('all')
  const [movementFromDate, setMovementFromDate] = useState('')
  const [movementToDate, setMovementToDate] = useState('')

  useEffect(() => {
    let active = true
    const loadCloudState = async () => {
      setCloudLoaded(false)
      setCloudError('')
      if (isDesktopApp()) {
        try {
          const localValues = await readDesktopState()
          if (!active) return
          setProducts((localValues.get('products') as Product[] | undefined) ?? [])
          setQuotes((localValues.get('quotes') as Quote[] | undefined) ?? [])
          setInvoices((localValues.get('invoices') as Invoice[] | undefined) ?? [])
          setCashEntries((localValues.get('cash') as CashEntry[] | undefined) ?? [])
          setStockMovements((localValues.get('stock-movements') as StockMovement[] | undefined) ?? [])
          setCloudLoaded(true)
        } catch {
          if (active) setCloudError('تعذر تحميل البيانات المحلية. لم يتم استبدال البيانات أو إنشاء بيانات افتراضية.')
        }
        return
      }
      let values: Map<string, unknown>
      const { data, error } = await supabase.from('app_state').select('state_key,state_value').eq('owner_id', user.id)
      if (!active) return
      if (error) { setCloudError('تعذر تحميل البيانات السحابية: ' + error.message + ' — لم يتم تحميل البيانات، أعد المحاولة بعد إصلاح الاتصال.'); return }
      values = new Map((data ?? []).map(row => [row.state_key, row.state_value]))
      // Only the owner's original account may import its existing browser data.
      // Every other account starts with completely empty inventory and records.
      const isOwnerAccount = user.id === '9301075f-da3f-438e-acb6-43fd0af65a41'
      const records = [
        { key: 'products', localKey: 'alarabi-products', fallback: isOwnerAccount ? load('alarabi-products', seed) : [] as Product[], setter: setProducts },
        { key: 'quotes', localKey: 'alarabi-quotes', fallback: isOwnerAccount ? load('alarabi-quotes', []) : [] as Quote[], setter: setQuotes },
        { key: 'invoices', localKey: 'alarabi-invoices', fallback: isOwnerAccount ? load('alarabi-invoices', []) : [] as Invoice[], setter: setInvoices },
        { key: 'cash', localKey: 'alarabi-cash', fallback: isOwnerAccount ? load('alarabi-cash', []) : [] as CashEntry[], setter: setCashEntries },
        { key: 'stock-movements', localKey: 'alarabi-stock-movements', fallback: isOwnerAccount ? load('alarabi-stock-movements', []) : [] as StockMovement[], setter: setStockMovements },
      ] as const
      for (const record of records) {
        const cloudValue = values.get(record.key)
        if (cloudValue !== undefined && cloudValue !== null) {
          record.setter(cloudValue as never)
          if (user.id === '9301075f-da3f-438e-acb6-43fd0af65a41') localStorage.setItem(record.localKey, JSON.stringify(cloudValue))
        } else {
          const localValue = isOwnerAccount
            ? load(record.localKey, record.fallback)
            : record.fallback
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
    if (isDesktopApp()) {
      void writeDesktopState('products', products).catch(() => setCloudError('تعذر حفظ البيانات محليًا.'))
      return
    }
    if (user.id === '9301075f-da3f-438e-acb6-43fd0af65a41') localStorage.setItem('alarabi-products', JSON.stringify(products))
    void supabase.from('app_state').upsert({ owner_id: user.id, state_key: 'products', state_value: products, updated_at: new Date().toISOString() }, { onConflict: 'owner_id,state_key' }).then(({ error }) => { if (error) setCloudError('مشكلة في حفظ الأصناف سحابيًا: ' + error.message) })
  }, [products, cloudLoaded, user.id])

  useEffect(() => {
    if (!cloudLoaded) return
    if (isDesktopApp()) {
      void writeDesktopState('quotes', quotes).catch(() => setCloudError('تعذر حفظ البيانات محليًا.'))
      return
    }
    if (user.id === '9301075f-da3f-438e-acb6-43fd0af65a41') localStorage.setItem('alarabi-quotes', JSON.stringify(quotes))
    void supabase.from('app_state').upsert({ owner_id: user.id, state_key: 'quotes', state_value: quotes, updated_at: new Date().toISOString() }, { onConflict: 'owner_id,state_key' }).then(({ error }) => { if (error) setCloudError('مشكلة في حفظ عروض الأسعار سحابيًا: ' + error.message) })
  }, [quotes, cloudLoaded, user.id])

  useEffect(() => {
    if (!cloudLoaded) return
    if (isDesktopApp()) {
      void writeDesktopState('invoices', invoices).catch(() => setCloudError('تعذر حفظ البيانات محليًا.'))
      return
    }
    if (user.id === '9301075f-da3f-438e-acb6-43fd0af65a41') localStorage.setItem('alarabi-invoices', JSON.stringify(invoices))
    void supabase.from('app_state').upsert({ owner_id: user.id, state_key: 'invoices', state_value: invoices, updated_at: new Date().toISOString() }, { onConflict: 'owner_id,state_key' }).then(({ error }) => { if (error) setCloudError('مشكلة في حفظ الفواتير سحابيًا: ' + error.message) })
  }, [invoices, cloudLoaded, user.id])

  useEffect(() => {
    if (!cloudLoaded) return
    if (isDesktopApp()) {
      void writeDesktopState('cash', cashEntries).catch(() => setCloudError('تعذر حفظ البيانات محليًا.'))
      return
    }
    if (user.id === '9301075f-da3f-438e-acb6-43fd0af65a41') localStorage.setItem('alarabi-cash', JSON.stringify(cashEntries))
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
      data: { products, quotes, invoices, cashEntries, stockMovements },
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
        !Array.isArray(data.cashEntries) ||
        (data.stockMovements !== undefined && !Array.isArray(data.stockMovements))
      ) {
        setNotice('ملف النسخة الاحتياطية غير صالح أو ناقص')
        return
      }
      const confirmed = window.confirm('تنبيه: استرجاع النسخة سيستبدل بيانات الأصناف وعروض الأسعار والفواتير والخزنة وحركات المخزون الحالية. هل حفظت نسخة من البيانات الحالية وتريد المتابعة؟')
      if (!confirmed) return
      setProducts(data.products)
      setQuotes(data.quotes)
      setInvoices(data.invoices)
      setCashEntries(data.cashEntries)
      setStockMovements(Array.isArray(data.stockMovements) ? data.stockMovements : [])
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
    if (isDesktopApp()) {
      void writeDesktopState('stock-movements', stockMovements).catch(() => setCloudError('تعذر حفظ البيانات محليًا.'))
      return
    }
    if (user.id === '9301075f-da3f-438e-acb6-43fd0af65a41') localStorage.setItem('alarabi-stock-movements', JSON.stringify(stockMovements))
    void supabase.from('app_state').upsert({ owner_id: user.id, state_key: 'stock-movements', state_value: stockMovements, updated_at: new Date().toISOString() }, { onConflict: 'owner_id,state_key' }).then(({ error }) => { if (error) setCloudError('مشكلة في حفظ سجل حركة المخزون: ' + error.message) })
  }, [stockMovements, cloudLoaded, user.id])

  const inventoryValue = products.reduce(
    (sum, p) => sum + p.quantity * p.price,
    0
  )

  const lowStock = products.filter(p => p.quantity <= p.minStock)
  const reportInvoices = invoices.filter(i => (!reportFrom || i.date >= reportFrom) && (!reportTo || i.date <= reportTo))
  const reportCash = cashEntries.filter(e => (!reportFrom || e.date >= reportFrom) && (!reportTo || e.date <= reportTo))
  const reportSales = reportInvoices.reduce((sum, i) => sum + invoiceTotalFor(i), 0)
  const reportCollected = reportInvoices.reduce((sum, i) => sum + Math.min(invoiceTotalFor(i), Math.max(0, i.paidAmount || 0)), 0)
  const reportBalance = reportInvoices.reduce((sum, i) => sum + Math.max(0, invoiceTotalFor(i) - (i.paidAmount || 0)), 0)
  const reportCashIn = reportCash.filter(e => e.kind === 'in').reduce((sum, e) => sum + e.amount, 0)
  const reportCashOut = reportCash.filter(e => e.kind === 'out').reduce((sum, e) => sum + e.amount, 0)
  const totalInvoiceSales = invoices.reduce((sum, invoice) => sum + invoiceTotalFor(invoice), 0)
  const totalCollected = invoices.reduce((sum, invoice) => sum + Math.min(invoiceTotalFor(invoice), Math.max(0, invoice.paidAmount || 0)), 0)
  const customerBalances = Math.max(0, totalInvoiceSales - totalCollected)
  const unpaidInvoices = invoices.filter(invoice => invoiceTotalFor(invoice) > (invoice.paidAmount || 0))
  const paidInvoiceCount = invoices.filter(invoice => invoiceTotalFor(invoice) <= (invoice.paidAmount || 0)).length
  // Only use cost snapshots stored on invoice lines. Falling back to today's
  // product cost would rewrite historical margins whenever a product is edited.
  const costCompleteInvoices = invoices.filter(invoice =>
    (invoice.items || []).every(item => typeof item.costPrice === 'number' && item.costPrice > 0)
  )
  const knownCostSales = costCompleteInvoices.reduce((sum, invoice) =>
    sum + invoice.items.reduce((itemSum, item) => itemSum + item.quantity * (item.costPrice ?? 0), 0), 0)
  const hasMissingCosts = costCompleteInvoices.length !== invoices.length
  const knownSalesBeforeTax = costCompleteInvoices.reduce((sum, invoice) => {
    const subtotal = invoice.items.reduce((itemSum, item) => itemSum + item.quantity * item.price, 0)
    const discount = Math.min(subtotal, Math.max(0, invoice.discount || 0))
    return sum + Math.max(0, subtotal - discount)
  }, 0)
  const estimatedGrossProfit = knownSalesBeforeTax - knownCostSales

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
            costPrice: String(p.costPrice ?? 0),
            minStock: String(p.minStock),
          }
        : {
            code: '',
            name: '',
            category: '',
            quantity: '0',
            price: '0',
            costPrice: '0',
            minStock: '2',
          }
    )
    setProductModal(p ?? 'new')
  }

  const saveProduct = () => {
    const code = draft.code.trim()
    const name = draft.name.trim()
    if (!code || !name) {
      setNotice('اكتب كود الصنف واسم الصنف الأول')
      return
    }

    const numericFields = [
      { label: 'الكمية', value: draft.quantity },
      { label: 'سعر البيع', value: draft.price },
      { label: 'سعر التكلفة', value: draft.costPrice },
      { label: 'حد التنبيه', value: draft.minStock },
    ]
    for (const field of numericFields) {
      const value = Number(field.value)
      if (!field.value.trim() || !Number.isFinite(value) || value < 0) {
        setNotice(field.label + ' لازم يكون رقم صحيح أو صفر فأكثر')
        return
      }
    }

    const editingId = productModal !== 'new' && productModal ? productModal.id : null
    const duplicateCode = products.some(
      p => p.id !== editingId && p.code.trim().toLocaleLowerCase() === code.toLocaleLowerCase()
    )
    if (duplicateCode) {
      setNotice('كود الصنف موجود بالفعل. استخدم كودًا مختلفًا')
      return
    }
    if (editingId && !products.some(p => p.id === editingId)) {
      setNotice('الصنف الذي تحاول تعديله لم يعد موجودًا. حدّث القائمة وحاول مرة أخرى')
      return
    }

    const item: Product = {
      id: editingId ?? crypto.randomUUID(),
      code,
      name,
      category: draft.category.trim() || 'عام',
      quantity: Number(draft.quantity),
      price: Number(draft.price),
      costPrice: Number(draft.costPrice),
      minStock: Number(draft.minStock),
    }

    setProducts(old =>
      editingId
        ? old.map(p => (p.id === item.id ? item : p))
        : [item, ...old]
    )

    setProductModal(null)
    setNotice('تم حفظ الصنف')
  }

  const recordStockMovement = () => {
    if (!products.length) { setNotice('أضف صنفًا أولًا'); return }
    setMovementProductId(products[0].id)
    setMovementKind('in')
    setMovementQuantity('')
    setMovementReason('')
    setMovementReference('')
    setStockMovementModal(true)
  }

  const saveStockMovement = () => {
    const product = products.find(item => item.id === movementProductId)
    if (!product) { setNotice('اختار الصنف'); return }
    const quantity = Number(movementQuantity)
    if (!Number.isFinite(quantity) || quantity <= 0) { setNotice('اكتب كمية أكبر من صفر'); return }
    if (movementKind === 'out' && quantity > product.quantity) {
      setNotice('الكمية المطلوبة أكبر من الرصيد الحالي (' + product.quantity + ')')
      return
    }
    if (!movementReason.trim()) { setNotice('اكتب سبب الحركة'); return }
    const delta = movementKind === 'in' ? quantity : -quantity
    const quantityBefore = product.quantity
    const quantityAfter = quantityBefore + delta
    setProducts(old => old.map(item => item.id === product.id ? { ...item, quantity: quantityAfter } : item))
    setStockMovements(old => [{
      id: crypto.randomUUID(),
      productId: product.id,
      productName: product.name,
      kind: movementKind,
      quantity,
      reason: movementReason.trim(),
      reference: movementReference.trim() || 'حركة يدوية',
      date: today(),
      quantityBefore,
      quantityAfter,
    }, ...old])
    setStockMovementModal(false)
    setNotice(movementKind === 'in' ? 'تم تسجيل دخول البضاعة وتحديث الرصيد' : 'تم تسجيل خروج البضاعة وتحديث الرصيد')
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
              costPrice: p.costPrice ?? 0,
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
    if (!Number.isFinite(invoiceTaxValue) || invoiceTaxValue < 0 || invoiceTaxValue > 100) {
      setNotice('نسبة الضريبة يجب أن تكون بين 0 و100')
      return
    }
    const paidInput = Number(invoicePaid)
    if (invoiceStatus !== 'paid' && (!invoicePaid.trim() || !Number.isFinite(paidInput) || paidInput < 0)) {
      setNotice('المبلغ المدفوع لازم يكون رقمًا صحيحًا ولا يقل عن صفر')
      return
    }
    if (invoiceStatus !== 'paid' && paidInput > invoiceTotal) {
      setNotice('المبلغ المدفوع لا يمكن أن يتجاوز إجمالي الفاتورة')
      return
    }
    if (!Number.isFinite(invoiceDiscountValue) || invoiceDiscountValue < 0) {
      setNotice('الخصم لازم يكون رقمًا صحيحًا ولا يقل عن صفر')
      return
    }

    // Reject invalid line items before calculating totals or touching stock.
    for (const row of quoteRows) {
      if (!row.productId || !row.name.trim() || !Number.isFinite(row.quantity) || row.quantity <= 0 || !Number.isFinite(row.price) || row.price < 0) {
        setNotice('راجع أصناف الفاتورة: الكمية لازم تكون أكبر من صفر والسعر لا يقل عن صفر')
        return
      }
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
        const quantityBefore = product.quantity
        return { id: crypto.randomUUID(), productId, productName: product.name, kind: 'out' as const, quantity, reason: 'بيع بفاتورة', reference: invoice.number, date: today(), quantityBefore, quantityAfter: quantityBefore - quantity }
      }),
      ...old,
    ])
    setInvoices(old => [invoice, ...old])
    // Record any amount collected at invoice creation in the cash ledger as well.
    if (paid > 0) {
      setCashEntries(old => [{
        id: crypto.randomUUID(),
        kind: 'in' as const,
        amount: paid,
        category: 'تحصيل فاتورة',
        note: 'تحصيل عند إنشاء الفاتورة ' + invoice.number + ' — ' + invoice.customer,
        date: today(),
        invoiceId: invoice.id,
      }, ...old])
    }
    setInvoiceModal(false)
    setTab('invoices')
    resetInvoiceDraft()
    setNotice('تم حفظ الفاتورة وخصم الكميات من المخزون بنجاح')
  }

  const deleteInvoice = (invoice: Invoice) => {
    const linkedPayments = cashEntries.filter(entry => entry.invoiceId === invoice.id)
    if (linkedPayments.length > 0) {
      setNotice('لا يمكن حذف فاتورة عليها تحصيلات مسجلة. سجّل ردّ المبلغ في الخزنة أولًا حتى لا تتعارض أرصدة الخزنة مع الفواتير.')
      return
    }
    if (!window.confirm('متأكد إنك عايز تحذف الفاتورة ' + invoice.number + '؟ سيتم إرجاع كمياتها للمخزون.')) return
    const returned = new Map<string, number>()
    for (const row of invoice.items || []) {
      returned.set(row.productId, (returned.get(row.productId) || 0) + row.quantity)
    }
    setProducts(old => old.map(product => ({
      ...product,
      quantity: product.quantity + (returned.get(product.id) || 0),
    })))
    setStockMovements(old => [
      ...Array.from(returned.entries()).map(([productId, quantity]) => {
        const product = products.find(item => item.id === productId)
        const quantityBefore = product?.quantity
        return {
          id: crypto.randomUUID(),
          productId,
          productName: invoice.items.find(row => row.productId === productId)?.name || product?.name || 'صنف',
          kind: 'in' as const,
          quantity,
          reason: 'إرجاع عند حذف فاتورة',
          reference: invoice.number,
          date: today(),
          ...(quantityBefore !== undefined ? { quantityBefore, quantityAfter: quantityBefore + quantity } : {}),
        }
      }),
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

  const printDocument = (html: string, documentName: string) => {
    if (isDesktopApp() && window.alarabiDesktop?.printHtml) {
      void window.alarabiDesktop.printHtml(html)
        .then(() => setNotice('تم فتح نافذة طباعة ' + documentName))
        .catch(error => setNotice('تعذرت طباعة ' + documentName + ': ' + String(error)))
      return
    }
    const printWindow = window.open('', '_blank')
    if (!printWindow) { setNotice('اسمح بفتح النوافذ المنبثقة لطباعة ' + documentName); return }
    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.focus()
    window.setTimeout(() => {
      try { printWindow.print() }
      catch (error) { setNotice('تعذرت طباعة ' + documentName + ': ' + String(error)) }
    }, 250)
  }

  const printInvoice = (invoice: Invoice) => {
    printDocument(invoiceHtml(invoice), 'الفاتورة')
  }

  const recordInvoicePayment = (invoice: Invoice) => {
    const total = invoiceTotalFor(invoice)
    const balance = Math.max(0, total - Math.max(0, invoice.paidAmount || 0))
    if (balance <= 0) { setNotice('الفاتورة مسددة بالكامل بالفعل'); return }
    const rawAmount = window.prompt('المتبقي على الفاتورة ' + money(balance) + '. اكتب مبلغ التحصيل:')
    if (rawAmount === null) return
    const amount = Number(rawAmount)
    if (!Number.isFinite(amount) || amount <= 0) { setNotice('اكتب مبلغ تحصيل صحيحًا أكبر من صفر'); return }
    if (amount > balance) { setNotice('مبلغ التحصيل أكبر من المتبقي على الفاتورة'); return }
    const payment = { id: crypto.randomUUID(), kind: 'in' as const, amount, category: 'تحصيل فاتورة', note: 'تحصيل ' + invoice.number + ' — ' + invoice.customer, date: today(), invoiceId: invoice.id }
    setCashEntries(old => [payment, ...old])
    setInvoices(old => old.map(item => {
      if (item.id !== invoice.id) return item
      const paidAmount = Math.min(total, Math.max(0, item.paidAmount || 0) + amount)
      return { ...item, paidAmount, status: paidAmount >= total ? 'paid' : 'partial' }
    }))
    setNotice('تم تسجيل التحصيل وتحديث الفاتورة والخزنة معًا')
  }

  const updateInvoiceStatus = (invoice: Invoice, status: Invoice['status']) => {
    if (status === 'paid') {
      recordInvoicePayment(invoice)
      return
    }
    if (status === 'unpaid' && (invoice.paidAmount || 0) > 0) {
      setNotice('لا يمكن إلغاء السداد مباشرة بعد تسجيل التحصيل؛ راجع حركات الخزنة وسجّل رد المبلغ كحركة خارجة عند الحاجة.')
      return
    }
    setInvoices(old => old.map(item => item.id === invoice.id
      ? {...item, status, paidAmount: status === 'unpaid' ? 0 : Math.min(invoiceTotalFor(item), item.paidAmount || 0)}
      : item))
  }

  const saveQuote = () => {
    if (!customer.trim() || !quoteRows.length) {
      setNotice('اكتب اسم العميل وأضف صنفًا واحدًا على الأقل')
      return
    }
    for (const row of quoteRows) {
      if (!row.productId || !row.name.trim() || !Number.isFinite(row.quantity) || row.quantity <= 0 || !Number.isFinite(row.price) || row.price < 0) {
        setNotice('راجع أصناف عرض السعر: الكمية لازم تكون أكبر من صفر والسعر لا يقل عن صفر')
        return
      }
    }

    // Pick the next number above the highest existing quote number so deleting
    // an older quote does not cause a duplicate number.
    const highestQuoteNumber = quotes.reduce((highest, quote) => {
      const match = /^QT-(\d+)$/.exec(quote.number)
      return match ? Math.max(highest, Number(match[1])) : highest
    }, 0)
    const quote: Quote = {
      id: crypto.randomUUID(),
      number: `QT-${String(highestQuoteNumber + 1).padStart(4, '0')}`,
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
    printDocument(quoteHtml(q), 'عرض السعر')
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
            className={tab === 'dashboard' ? 'nav-item active' : 'nav-item'} data-tutorial-target="dashboard"
            onClick={() => setTab('dashboard')}
          >
            <LayoutDashboard size={19} /> لوحة التحكم
          </button>

          <button
            className={tab === 'products' ? 'nav-item active' : 'nav-item'} data-tutorial-target="products"
            onClick={() => setTab('products')}
          >
            <Package size={19} /> الأصناف والمخزون
          </button>

          <button
            className={tab === 'quotes' ? 'nav-item active' : 'nav-item'} data-tutorial-target="quotes"
            onClick={() => setTab('quotes')}
          >
            <FileText size={19} /> عروض الأسعار
            <span className="nav-count">{quotes.length}</span>
          </button>

          <button className={tab === 'cash' ? 'nav-item active' : 'nav-item'} data-tutorial-target="cash" onClick={() => setTab('cash')}><Wallet size={19} /> الخزنة والحركة المالية</button>

          <button
            className={tab === 'invoices' ? 'nav-item active' : 'nav-item'} data-tutorial-target="invoices"
            onClick={() => setTab('invoices')}
          >
            <Receipt size={19} /> الفواتير
            <span className="nav-count">{invoices.length}</span>
          </button>
        </nav>

        <button className={tab === 'reports' ? 'nav-item active' : 'nav-item'} data-tutorial-target="reports" onClick={() => setTab('reports')}><Download size={19} /> التقارير والتصدير</button>
        <button className="nav-item" onClick={() => { setTutorialStep(0); setTab('dashboard') }}>📘 شرح البرنامج</button>
        <button data-tutorial-target="account" className="nav-item" onClick={() => { if (isDesktopApp()) void window.alarabiDesktop!.localLogout().then(() => window.location.reload()); else void supabase.auth.signOut() }}>تسجيل الخروج</button>
        <div className="sidebar-foot">
          <span className="status-dot" /> إدارة المخزون
          <small>v1.0.0</small>
        </div>
      </aside>

      <main className="main">
        {tutorialStep !== null && <div role="dialog" aria-modal="true" aria-label="شرح البرنامج" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(9,22,36,.58)', padding: 18, direction: 'rtl' }}>
          {tutorialTargetRect && <div aria-hidden="true" style={{ position: 'fixed', top: tutorialTargetRect.top - 5, left: tutorialTargetRect.left - 5, width: tutorialTargetRect.width + 10, height: tutorialTargetRect.height + 10, border: '2px solid #d2a85b', borderRadius: 12, boxShadow: '0 0 0 9999px rgba(9,22,36,.22), 0 0 22px rgba(210,168,91,.65)', pointerEvents: 'none', zIndex: 10000, transition: 'all .25s ease' }} />}
          {tutorialTargetRect && <div aria-hidden="true" style={{ position: 'fixed', top: Math.max(8, tutorialTargetRect.top + tutorialTargetRect.height / 2 - 18), left: Math.max(8, tutorialTargetRect.left - 48), zIndex: 10001, color: '#f0c66e', fontSize: 38, lineHeight: 1, filter: 'drop-shadow(0 2px 5px rgba(0,0,0,.4))', pointerEvents: 'none' }}>➜</div>}
          <section style={{ position: 'absolute', left: '50%', bottom: 'max(20px, env(safe-area-inset-bottom))', transform: 'translateX(-50%)', width: 'min(100%, 520px)', background: 'linear-gradient(145deg,#fff,#f5f8fb)', color: '#18334b', border: '1px solid rgba(255,255,255,.7)', borderRadius: 20, padding: 22, boxShadow: '0 24px 80px rgba(0,0,0,.3)', textAlign: 'right' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#718397' }}>دليل الاستخدام · {tutorialStep + 1} من {tutorialSteps.length}</span>
              <button type="button" onClick={finishTutorial} style={{ border: 0, background: '#eaf0f5', borderRadius: 9, padding: '8px 12px', cursor: 'pointer', color: '#29445c' }}>إنهاء الشرح ×</button>
            </div>
            <div style={{ height: 4, background: '#e5ebf0', borderRadius: 9, overflow: 'hidden', marginBottom: 18 }}><div style={{ height: '100%', width: ((tutorialStep + 1) / tutorialSteps.length * 100) + '%', background: 'linear-gradient(90deg,#b38b43,#e3c47f)', transition: 'width .25s' }} /></div>
            <h2 style={{ fontSize: 22, margin: '0 0 10px', color: '#173653' }}>{tutorialSteps[tutorialStep].title}</h2>
            <p style={{ fontSize: 15, lineHeight: 1.9, margin: '0 0 22px', color: '#53687a' }}>{tutorialSteps[tutorialStep].text}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <button type="button" onClick={() => moveTutorial(-1)} disabled={tutorialStep === 0} style={{ border: '1px solid #d7e0e7', background: '#fff', color: '#173653', borderRadius: 10, padding: '11px 16px', cursor: 'pointer', opacity: tutorialStep === 0 ? .45 : 1 }}>السابق</button>
              <button type="button" onClick={() => moveTutorial(1)} style={{ border: 0, background: 'linear-gradient(135deg,#173653,#245579)', color: '#fff', borderRadius: 10, padding: '11px 20px', cursor: 'pointer', fontWeight: 700, boxShadow: '0 5px 14px rgba(23,54,83,.2)' }}>{tutorialStep === tutorialSteps.length - 1 ? 'ابدأ الاستخدام' : 'التالي ←'}</button>
            </div>
          </section>
        </div>}
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
                  : tab === 'quotes' ? 'عروض الأسعار' : tab === 'cash' ? 'الخزنة والحركة المالية' : tab === 'reports' ? 'التقارير والتصدير' : 'الفواتير'}
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
              <Stat icon={<TrendingUp />} label="تكلفة البضاعة المباعة المسجلة" value={money(knownCostSales)} foot={hasMissingCosts ? `بيانات مكتملة لـ ${costCompleteInvoices.length} من ${invoices.length} فاتورة` : 'حسب تكلفة الشراء المحفوظة بالفواتير'} warning={hasMissingCosts} />
              <Stat icon={<CircleDollarSign />} label="هامش إجمالي تقديري" value={money(estimatedGrossProfit)} foot={hasMissingCosts ? 'تقدير للفواتير المكتملة فقط، قبل المصروفات والضرائب' : 'المبيعات بعد الخصم وقبل الضريبة ناقص التكلفة'} warning={hasMissingCosts} />
            </section>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <h3>آخر حركات المخزون</h3>
                  <p>سجل تلقائي لخصم الكميات عند إنشاء فاتورة وإرجاعها عند حذفها.</p>
                </div>
                <span className="muted">{stockMovements.length} حركة</span>
              </div>
              {stockMovements.length === 0 ? (
                <div className="empty-state">لسه مفيش حركات مسجلة. هتظهر هنا حركات الفواتير الجديدة.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>التاريخ</th><th>الصنف</th><th>نوع الحركة</th><th>الكمية</th><th>السبب</th><th>المرجع</th></tr></thead>
                    <tbody>
                      {stockMovements.slice(0, 10).map(movement => (
                        <tr key={movement.id}>
                          <td>{movement.date}</td>
                          <td className="product-cell">{movement.productName}</td>
                          <td><span className={movement.kind === 'in' ? 'pill success' : 'pill danger'}>{movement.kind === 'in' ? 'دخول' : 'خروج'}</span></td>
                          <td>{movement.quantity}</td>
                          <td>{movement.reason}</td>
                          <td><code>{movement.reference}</code></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
            {cashEntries.length ? <div className="table-wrap"><table><thead><tr><th>التاريخ</th><th>النوع</th><th>البند</th><th>ملاحظات</th><th>المبلغ</th><th>إجراء</th></tr></thead><tbody>{cashEntries.map(entry => <tr key={entry.id}><td>{entry.date}</td><td><span className={entry.kind === 'in' ? 'pill success' : 'pill danger'}>{entry.kind === 'in' ? 'مبلغ داخل' : 'مبلغ خارج'}</span></td><td className="product-cell">{entry.category}</td><td>{entry.note || '—'}</td><td><strong>{entry.kind === 'in' ? '+' : '−'} {money(entry.amount)}</strong></td><td>{entry.invoiceId ? <span className="muted">مرتبطة بفاتورة</span> : <button className="icon-btn delete" title="حذف الحركة" aria-label="حذف الحركة" onClick={() => deleteCashEntry(entry)}><Trash2 size={16} /></button>}</td></tr>)}</tbody></table></div> : <Empty title="لسه مفيش حركات مالية" detail="سجّل أول مبلغ داخل أو خارج لمتابعة الخزنة." />}
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

              <div className="products-actions">
                <button className="secondary-button" onClick={recordStockMovement}>
                  <Boxes size={17} /> تسجيل حركة مخزون
                </button>
                <button className="primary-btn" onClick={() => openProduct()}>
                  <Plus size={17} /> إضافة صنف
                </button>
              </div>
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

            <section className="panel">
              <div className="panel-head">
                <div>
                  <h3>تقرير حركة المخزون</h3>
                  <p>ابحث بكود الصنف أو اسمه، وحدد نوع الحركة والفترة الزمنية لمراجعة السجل.</p>
                </div>
                <span className="muted">{stockMovements.filter(m => (!query.trim() || (m.productName + ' ' + (products.find(p => p.id === m.productId)?.code || '')).toLowerCase().includes(query.trim().toLowerCase())) && (movementKindFilter === 'all' || m.kind === movementKindFilter) && (!movementFromDate || m.date >= movementFromDate) && (!movementToDate || m.date <= movementToDate)).length} حركة</span>
              </div>
              <div className="form-grid" style={{ marginBottom: 16 }}>
                <label className="field"><span>نوع الحركة</span>
                  <select value={movementKindFilter} onChange={e => setMovementKindFilter(e.target.value as 'all' | 'in' | 'out')}>
                    <option value="all">كل الحركات</option><option value="in">دخول فقط</option><option value="out">خروج فقط</option>
                  </select>
                </label>
                <label className="field"><span>من تاريخ</span><input type="date" value={movementFromDate} onChange={e => setMovementFromDate(e.target.value)} /></label>
                <label className="field"><span>إلى تاريخ</span><input type="date" value={movementToDate} onChange={e => setMovementToDate(e.target.value)} /></label>
                <div style={{ display: 'flex', alignItems: 'end' }}><button className="secondary-btn" onClick={() => { setMovementKindFilter('all'); setMovementFromDate(''); setMovementToDate('') }}>مسح الفلاتر</button></div>
              </div>
              {stockMovements.filter(m => (!query.trim() || (m.productName + ' ' + (products.find(p => p.id === m.productId)?.code || '')).toLowerCase().includes(query.trim().toLowerCase())) && (movementKindFilter === 'all' || m.kind === movementKindFilter) && (!movementFromDate || m.date >= movementFromDate) && (!movementToDate || m.date <= movementToDate)).length ? (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>التاريخ</th><th>كود الصنف</th><th>الصنف</th><th>الحركة</th><th>الكمية</th><th>الرصيد قبل</th><th>الرصيد بعد</th><th>السبب</th><th>المرجع</th></tr></thead>
                    <tbody>
                      {stockMovements.filter(m => (!query.trim() || (m.productName + ' ' + (products.find(p => p.id === m.productId)?.code || '')).toLowerCase().includes(query.trim().toLowerCase())) && (movementKindFilter === 'all' || m.kind === movementKindFilter) && (!movementFromDate || m.date >= movementFromDate) && (!movementToDate || m.date <= movementToDate)).map(movement => (
                        <tr key={movement.id}>
                          <td>{movement.date}</td>
                          <td><code>{products.find(p => p.id === movement.productId)?.code || '—'}</code></td>
                          <td className="product-cell">{movement.productName}</td>
                          <td><span className={movement.kind === 'in' ? 'pill success' : 'pill danger'}>{movement.kind === 'in' ? 'دخول' : 'خروج'}</span></td>
                          <td>{movement.quantity}</td>
                          <td>{movement.quantityBefore ?? '—'}</td>
                          <td>{movement.quantityAfter ?? '—'}</td>
                          <td>{movement.reason}</td>
                          <td>{movement.reference || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="empty-state">مفيش حركات مخزون مطابقة للفلاتر والبحث.</div>}
            </section>

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
                              const usedInInvoice = invoices.some(invoice =>
                                (invoice.items || []).some(item => item.productId === p.id)
                              )
                              const usedInQuote = quotes.some(quote =>
                                (quote.items || []).some(item => item.productId === p.id)
                              )
                              const usedInMovement = stockMovements.some(movement => movement.productId === p.id)

                              if (usedInInvoice || usedInQuote || usedInMovement) {
                                setNotice('لا يمكن حذف الصنف لأنه مرتبط بفواتير أو عروض أسعار أو سجل حركة المخزون. احتفظ به لحماية السجلات السابقة، ويمكنك تعديل بياناته بدلًا من حذفه.')
                                return
                              }
                              if (confirm(`حذف الصنف ${p.name}؟`)) {
                                setProducts(old => old.filter(x => x.id !== p.id))
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

        {tab === 'reports' && (
          <section className="reports-page" dir="rtl">
            <div className="panel"><div className="panel-head"><div><h3>مركز التقارير</h3><p>تقارير المبيعات والخزنة والمخزون — كحلي ورمادي ولمسات حمراء.</p></div><span className="muted">AL / DATA</span></div>
              <div className="report-filters">
                <label>من تاريخ<input type="date" value={reportFrom} onChange={e=>setReportFrom(e.target.value)} /></label>
                <label>إلى تاريخ<input type="date" value={reportTo} onChange={e=>setReportTo(e.target.value)} /></label>
                <label>نوع التقرير<select value={reportKind} onChange={e=>setReportKind(e.target.value as 'sales'|'cash'|'inventory')}><option value="sales">المبيعات والفواتير</option><option value="cash">الخزنة والحركة المالية</option><option value="inventory">الأصناف والمخزون</option></select></label>
                <button className="secondary-btn" onClick={()=>{setReportFrom('');setReportTo('')}}>مسح الفترة</button>
              </div>
            </div>
            <div className="report-stats">
              {reportKind==='sales'?<><Stat icon={<Receipt/>} label="إجمالي المبيعات" value={money(reportSales)} foot={reportInvoices.length+' فاتورة'}/><Stat icon={<Wallet/>} label="المحصّل" value={money(reportCollected)} foot="حسب مبالغ السداد المسجلة"/><Stat icon={<AlertTriangle/>} label="المتبقي" value={money(reportBalance)} foot="مستحقات العملاء" warning={reportBalance>0}/></>:reportKind==='cash'?<><Stat icon={<ArrowDownLeft/>} label="مبالغ داخلة" value={money(reportCashIn)} foot="إجمالي الداخل"/><Stat icon={<ArrowUpRight/>} label="مبالغ خارجة" value={money(reportCashOut)} foot="إجمالي الخارج"/><Stat icon={<Wallet/>} label="صافي الحركة" value={money(reportCashIn-reportCashOut)} foot="داخل ناقص خارج"/></>:<><Stat icon={<Package/>} label="عدد الأصناف" value={String(products.length)} foot="الأصناف المسجلة"/><Stat icon={<Boxes/>} label="إجمالي الوحدات" value={String(products.reduce((s,p)=>s+p.quantity,0))} foot="الرصيد الحالي"/><Stat icon={<AlertTriangle/>} label="أصناف منخفضة" value={String(lowStock.length)} foot="عند الحد الأدنى أو أقل" warning={lowStock.length>0}/></>}
            </div>
            <div className="panel"><div className="panel-head"><div><h3>{reportKind==='sales'?'تفاصيل الفواتير':reportKind==='cash'?'الحركات المالية':'كشف المخزون'}</h3><p>التصدير يشمل البيانات المحددة أدناه.</p></div><div className="report-actions">
              <button className="primary-btn" onClick={()=>{
                const headers=reportKind==='sales'?['التاريخ','رقم الفاتورة','العميل','الإجمالي','المدفوع','المتبقي','الحالة']:reportKind==='cash'?['التاريخ','النوع','البند','ملاحظات','المبلغ']:['كود الصنف','اسم الصنف','الفئة','الكمية','حد التنبيه','سعر البيع','تكلفة الوحدة','قيمة المخزون بسعر التكلفة'];
                const rows:(string|number)[][]=reportKind==='sales'?reportInvoices.map(i=>[i.date,i.number,i.customer,invoiceTotalFor(i),i.paidAmount||0,Math.max(0,invoiceTotalFor(i)-(i.paidAmount||0)),i.status==='paid'?'مدفوعة':i.status==='partial'?'جزئيًا':'غير مدفوعة']):reportKind==='cash'?reportCash.map(e=>[e.date,e.kind==='in'?'داخل':'خارج',e.category,e.note,e.amount]):products.map(p=>[p.code,p.name,p.category,p.quantity,p.minStock,p.price,p.costPrice??0,p.quantity*(p.costPrice??0)]);
                const sheet=XLSX.utils.aoa_to_sheet([headers,...rows]);
                sheet['!cols']=headers.map((h,index)=>({wch:Math.min(32,Math.max(14,String(h).length+4,...rows.map(row=>String(row[index]??'').length+2)))}));
                const workbook=XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook,sheet,reportKind==='sales'?'المبيعات':reportKind==='cash'?'الخزنة':'المخزون');
                const fileName=(reportKind==='sales'?'alarabi-sales':reportKind==='cash'?'alarabi-cash':'alarabi-inventory')+'-'+today()+'.xlsx';
                XLSX.writeFile(workbook,fileName,{compression:true});
                setNotice('تم تصدير ملف Excel بصيغة XLSX بنجاح')
              }}><Download size={16}/> تصدير Excel</button>
              <button className="secondary-btn" onClick={()=>{
                const headers=reportKind==='sales'?['التاريخ','رقم الفاتورة','العميل','الإجمالي','المدفوع','المتبقي','الحالة']:reportKind==='cash'?['التاريخ','النوع','البند','ملاحظات','المبلغ']:['كود الصنف','اسم الصنف','الفئة','الكمية','حد التنبيه','سعر البيع','تكلفة الوحدة','قيمة المخزون'];
                const rows:(string|number)[][]=reportKind==='sales'?reportInvoices.map(i=>[i.date,i.number,i.customer,invoiceTotalFor(i),i.paidAmount||0,Math.max(0,invoiceTotalFor(i)-(i.paidAmount||0)),i.status==='paid'?'مدفوعة':i.status==='partial'?'جزئيًا':'غير مدفوعة']):reportKind==='cash'?reportCash.map(e=>[e.date,e.kind==='in'?'داخل':'خارج',e.category,e.note,e.amount]):products.map(p=>[p.code,p.name,p.category,p.quantity,p.minStock,p.price,p.costPrice??0,p.quantity*(p.costPrice??0)]);
                const title=reportKind==='sales'?'تقرير المبيعات والفواتير':reportKind==='cash'?'تقرير الخزنة والحركة المالية':'تقرير الأصناف والمخزون';
                const esc=(v:unknown)=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                const table='<table><thead><tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
                const w=window.open('','_blank');if(!w){setNotice('اسمح بفتح النوافذ المنبثقة لطباعة التقرير');return}
                w.document.write('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>'+title+'</title><style>body{font:12px Tahoma,Arial,sans-serif;color:#263746;padding:20px}h1{color:#173653;border-right:5px solid #c83d46;padding-right:12px}.brand{border-bottom:3px solid #c83d46;padding-bottom:12px;margin-bottom:18px}table{width:100%;border-collapse:collapse;margin-top:18px}th{background:#173653;color:white}th,td{border:1px solid #cfd7df;padding:8px;text-align:right}tr:nth-child(even){background:#f1f4f7}@page{size:A4 landscape;margin:12mm}@media print{body{padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><div class="brand"><h1>'+title+'</h1><strong>'+COMPANY+'</strong><p>الفترة: '+(reportFrom||'من البداية')+' — '+(reportTo||'حتى اليوم')+' | تاريخ التصدير: '+today()+'</p></div>'+table+'<script>window.onload=()=>window.print()</script></body></html>');w.document.close()
              }}><Printer size={16}/> طباعة / حفظ PDF</button>
            </div></div>
            <div className="table-wrap"><table><thead><tr>{(reportKind==='sales'?['التاريخ','رقم الفاتورة','العميل','الإجمالي','المدفوع','المتبقي','الحالة']:reportKind==='cash'?['التاريخ','النوع','البند','ملاحظات','المبلغ']:['الكود','الصنف','الفئة','الكمية','حد التنبيه','سعر البيع','تكلفة الوحدة','قيمة المخزون']).map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
              {reportKind==='sales'?reportInvoices.map(i=><tr key={i.id}><td>{i.date}</td><td>{i.number}</td><td>{i.customer}</td><td>{money(invoiceTotalFor(i))}</td><td>{money(i.paidAmount||0)}</td><td>{money(Math.max(0,invoiceTotalFor(i)-(i.paidAmount||0)))}</td><td>{i.status==='paid'?'مدفوعة':i.status==='partial'?'جزئيًا':'غير مدفوعة'}</td></tr>):reportKind==='cash'?reportCash.map(e=><tr key={e.id}><td>{e.date}</td><td>{e.kind==='in'?'داخل':'خارج'}</td><td>{e.category}</td><td>{e.note||'—'}</td><td>{money(e.amount)}</td></tr>):products.map(p=><tr key={p.id}><td>{p.code}</td><td>{p.name}</td><td>{p.category}</td><td>{p.quantity}</td><td>{p.minStock}</td><td>{money(p.price)}</td><td>{money(p.costPrice??0)}</td><td>{money(p.quantity*(p.costPrice??0))}</td></tr>)}
              {reportKind==='sales'&&!reportInvoices.length&&<tr><td colSpan={7}>لا توجد فواتير في الفترة المحددة.</td></tr>}{reportKind==='cash'&&!reportCash.length&&<tr><td colSpan={5}>لا توجد حركات في الفترة المحددة.</td></tr>}{reportKind==='inventory'&&!products.length&&<tr><td colSpan={8}>لا توجد أصناف.</td></tr>}
            </tbody></table></div></div>
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
                      {inv.status !== 'paid' && <button className="secondary-btn invoice-status-btn" onClick={() => recordInvoicePayment(inv)}>تحصيل دفعة</button>}
                      <button className="icon-btn delete" aria-label="حذف الفاتورة" title="حذف الفاتورة" onClick={() => deleteInvoice(inv)}><Trash2 size={16} /></button>
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

      {stockMovementModal && (
        <div className="modal-backdrop" onClick={() => setStockMovementModal(false)}>
          <section className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div><h2>تسجيل حركة مخزون</h2><p>حدد الصنف ونوع الحركة لتحديث الرصيد وتسجيلها في السجل.</p></div>
              <button className="icon-btn" onClick={() => setStockMovementModal(false)} aria-label="إغلاق"><X /></button>
            </div>
            <div className="form-grid">
              <label className="field"><span>الصنف *</span>
                <select value={movementProductId} onChange={e => setMovementProductId(e.target.value)}>
                  {products.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name} (الرصيد: {p.quantity})</option>)}
                </select>
              </label>
              <label className="field"><span>نوع الحركة *</span>
                <select value={movementKind} onChange={e => setMovementKind(e.target.value as 'in' | 'out')}>
                  <option value="in">دخول بضاعة — إضافة للرصيد</option>
                  <option value="out">خروج بضاعة — خصم من الرصيد</option>
                </select>
              </label>
              <Field label="الكمية *" type="number" value={movementQuantity} onChange={setMovementQuantity} placeholder="اكتب الكمية" />
              <Field label="سبب الحركة *" value={movementReason} onChange={setMovementReason} placeholder="شراء بضاعة، صرف لمشروع..." />
              <Field label="المرجع (اختياري)" value={movementReference} onChange={setMovementReference} placeholder="رقم إذن الصرف أو فاتورة الشراء" />
            </div>
            {products.find(p => p.id === movementProductId) && (
              <p className="muted" style={{ marginTop: 12 }}>الرصيد الحالي: <strong>{products.find(p => p.id === movementProductId)?.quantity}</strong> — بعد الحركة: <strong>{(products.find(p => p.id === movementProductId)?.quantity ?? 0) + (movementKind === 'in' ? 1 : -1) * (Number(movementQuantity) > 0 ? Number(movementQuantity) : 0)}</strong></p>
            )}
            <div className="modal-actions">
              <button className="secondary-btn" onClick={() => setStockMovementModal(false)}>إلغاء</button>
              <button className="primary-btn" onClick={saveStockMovement}><Check size={17} /> حفظ الحركة</button>
            </div>
          </section>
        </div>
      )}

      {productModal && (
        <div
          className="modal-backdrop"
          // Keep the editor open if a click lands outside the panel accidentally.
          // Close explicitly with Cancel or the close button.
          onClick={event => { if (event.target === event.currentTarget) event.preventDefault() }}
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
              {notice && <div role="alert" style={{ margin: '10px 0', padding: '10px 12px', border: '1px solid #e8c7a0', borderRadius: 8, background: '#fff8ed', color: '#7a4b16', fontSize: 13 }}>{notice}</div>}

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
                label="سعر البيع للوحدة (جنيه)"
                type="number"
                value={draft.price}
                onChange={v => setDraft({ ...draft, price: v })}
              />

              <Field
                label="تكلفة الشراء للوحدة (جنيه)"
                type="number"
                value={draft.costPrice}
                onChange={v => setDraft({ ...draft, costPrice: v })}
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
            {notice && <div role="alert" style={{ margin: '10px 0', padding: '10px 12px', border: '1px solid #e8c7a0', borderRadius: 8, background: '#fff8ed', color: '#7a4b16', fontSize: 13 }}>{notice}</div>}
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
  ':root{--navy:#102d46;--blue:#1c5d83;--gold:#c99d48;--ink:#1c2f40;--muted:#617487;--line:#d7e1e9;--pale:#f2f6f9}' +
  '*{box-sizing:border-box}html{background:#edf1f5}body{margin:0;padding:24px;background:#edf1f5;color:var(--ink);font:13px/1.7 Tahoma,Arial,sans-serif}.actions{max-width:900px;margin:0 auto 14px;display:flex;gap:8px;justify-content:flex-end}.actions button{border:0;border-radius:8px;padding:11px 18px;background:var(--navy);color:#fff;font:inherit;font-weight:bold;cursor:pointer}.actions .secondary{background:#fff;color:var(--navy);border:1px solid var(--line)}' +
  '.sheet{max-width:900px;min-height:1120px;margin:auto;background:#fff;position:relative;overflow:hidden;box-shadow:0 18px 55px #102d4620;border:1px solid #e1e8ee}.top-stripe{height:7px;background:linear-gradient(90deg,var(--navy) 0%,var(--blue) 72%,var(--gold) 100%)}.header{padding:28px 34px 23px;display:flex;align-items:center;justify-content:space-between;gap:20px;border-bottom:1px solid var(--line)}.brand{display:flex;align-items:center;gap:15px;min-width:0}.logo{width:90px;height:78px;object-fit:contain}.company{font-size:21px;line-height:1.5;font-weight:800;color:var(--navy);margin:0}.subtitle{font-size:10px;letter-spacing:.5px;color:var(--muted)}.tagline{font-size:11px;color:var(--blue);margin-top:5px}.doc-chip{background:#fff;color:var(--navy);border:2px solid var(--navy);border-radius:0;padding:10px 18px;text-align:center;min-width:150px;box-shadow:none}.doc-chip strong{display:block;font-size:23px;line-height:1.4}.doc-chip span{font-size:10px;letter-spacing:1.4px;color:var(--muted)}' +
  '.intro{padding:25px 34px 15px;display:flex;align-items:end;justify-content:space-between;gap:15px}.intro h2{margin:0;color:var(--navy);font-size:26px;display:inline-block;border-right:4px solid var(--gold);padding-right:12px;letter-spacing:-.3px}.intro p{margin:5px 0 0;color:var(--muted);font-size:12px}.number{text-align:left;color:var(--muted);font-size:11px}.number b{display:block;color:var(--blue);font-size:16px;direction:ltr;border:1px solid var(--line);background:var(--pale);padding:5px 10px;margin-top:4px;letter-spacing:.5px}.details{padding:0 34px 20px;display:grid;grid-template-columns:1fr 1fr;gap:13px}.detail{background:linear-gradient(135deg,#f4f8fb,#edf3f7);border:1px solid #dce6ed;border-right:3px solid var(--blue);border-radius:3px;padding:15px 17px}.detail h3{margin:0 0 9px;font-size:12px;color:var(--blue)}.detail-row{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #dbe5ed}.detail-row:last-child{border-bottom:0}.detail-row span{color:var(--muted)}.detail-row b{color:var(--navy);text-align:left;overflow-wrap:anywhere}' +
  '.table-wrap{padding:0 34px}table{width:100%;border-collapse:separate;border-spacing:0;font-size:11px;border:1px solid var(--line);border-radius:4px;overflow:hidden}thead{display:table-header-group}th{background:linear-gradient(110deg,var(--navy),var(--blue));color:#fff;text-align:right;padding:13px 10px;font-weight:700;letter-spacing:.1px}td{padding:12px 9px;border-bottom:1px solid var(--line);background:#fff}tbody tr:nth-child(even) td{background:#f3f7fa}tbody tr:last-child td{border-bottom:0}tbody tr:hover td{background:#edf4f8}.center{text-align:center;white-space:nowrap}.money{white-space:nowrap;font-variant-numeric:tabular-nums}.code{direction:ltr;display:inline-block;color:var(--blue);font-size:10px;font-weight:bold}.item{font-weight:700}' +
  '.lower{padding:20px 34px 0;display:grid;grid-template-columns:1fr 1.08fr;gap:18px;align-items:stretch}.notes,.totals{border:1px solid var(--line);border-radius:4px;overflow:hidden}.notes{background:linear-gradient(145deg,#f8fafc,#eef3f7);padding:16px;border-top:3px solid var(--gold)}.notes h3{margin:0 0 9px;color:var(--navy);font-size:14px}.notes p{margin:0 0 7px;color:var(--muted);font-size:11px}.notes ul{margin:8px 0 0;padding-right:18px;color:var(--ink);font-size:11px}.totals{padding:8px 15px}.sum-row{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid #e8eef3}.sum-row span{color:var(--muted)}.sum-row b{white-space:nowrap;font-variant-numeric:tabular-nums}.sum-row.final{margin:8px -8px -1px;padding:15px 12px;background:linear-gradient(110deg,var(--navy),var(--blue));color:#fff;border-radius:2px}.sum-row.final span,.sum-row.final b{color:#fff;font-size:15px;font-weight:800}.terms{padding:18px 34px 0;font-size:10px;color:var(--muted);line-height:1.9;border-top:1px solid var(--line);margin:18px 34px 0}.terms strong{color:var(--navy)}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:80px;padding:35px 55px 28px}.sign{border-top:1px dashed #8da2b3;text-align:center;padding-top:9px;color:var(--navy);font-size:11px;font-weight:bold;min-height:43px}.footer{background:linear-gradient(110deg,var(--navy),#174866);color:#eaf2f8;padding:17px 34px;display:flex;justify-content:space-between;align-items:center;gap:15px;font-size:10px;border-top:3px solid var(--gold)}.footer strong{color:#fff;font-size:12px}.footer .motto{color:#f0c66e;font-size:12px;font-weight:bold}' +
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
'.sheet{width:100%;max-width:850px;min-height:1050px;margin:0 auto;background:#fff;padding:42px 46px;box-shadow:0 18px 55px rgba(20,43,61,.14);border:1px solid #e1e8ee;position:relative;overflow:hidden}' +
'.accent{height:7px;background:linear-gradient(90deg,#173653 0%,#245b80 72%,#c6a66b 100%);position:absolute;top:0;right:0;left:0}' +
'.head{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:8px 0 24px;border-bottom:1px solid var(--line)}.brand-lockup{display:flex;align-items:center;gap:16px;min-width:0}.company-logo{width:104px;height:86px;object-fit:contain;flex-shrink:0}' +
'.company-name{font-size:22px;line-height:1.55;font-weight:800;color:var(--navy);margin:0}.company-sub{font-size:11px;color:var(--muted);letter-spacing:.4px}.doc-badge{min-width:145px;text-align:center;background:var(--pale);border:1px solid #dce7ee;border-radius:10px;padding:12px 16px}.doc-badge strong{display:block;font-size:20px;color:var(--navy)}.doc-badge span{font-size:11px;color:var(--muted)}' +
'.title-row{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;margin:27px 0 18px;padding-right:12px;border-right:4px solid #c6a66b}h2{font-size:23px;color:var(--navy);margin:0}.invoice-no{font-size:12px;color:var(--muted)}.invoice-no b{color:var(--blue);font-size:15px;direction:ltr;display:inline-block}' +
'.details{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:0 0 24px}.detail-card{border:1px solid var(--line);border-radius:9px;padding:13px 15px;min-width:0}.detail-card h3{margin:0 0 7px;font-size:11px;color:var(--muted);font-weight:700}.detail-card .value{font-size:14px;font-weight:700;color:var(--navy);overflow-wrap:anywhere}.detail-card .subvalue{font-size:11px;color:var(--muted);margin-top:3px}.section-title{font-size:13px;color:var(--navy);font-weight:800;margin:0 0 9px}' +
'table{width:100%;border-collapse:separate;border-spacing:0;margin-top:8px;font-size:12px}thead{display:table-header-group}th{background:linear-gradient(110deg,var(--navy),var(--blue));color:#fff;font-weight:700;padding:13px 10px;text-align:right;white-space:nowrap;letter-spacing:.15px}th:first-child{border-radius:0 7px 0 0}th:last-child{border-radius:7px 0 0 0}td{padding:12px 10px;border-bottom:1px solid var(--line);vertical-align:top}tbody tr:nth-child(even) td{background:#f8fafb}.num{text-align:center;width:38px;color:var(--muted)}.amount{white-space:nowrap;font-variant-numeric:tabular-nums}.item-name{font-weight:700;color:var(--ink)}.item-code{font-size:10px;color:var(--muted);direction:ltr;display:inline-block}' +
'.bottom-grid{display:grid;grid-template-columns:minmax(0,1fr) 285px;gap:24px;align-items:start;margin-top:23px}.notes{border:1px solid var(--line);border-radius:9px;padding:13px 14px;min-height:94px}.notes h3{margin:0 0 6px;font-size:12px;color:var(--navy)}.notes p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--muted)}.notes-empty{color:#8a99a5;font-size:11px}' +
'.totals{border:1px solid var(--line);border-radius:10px;padding:8px 13px}.total-line{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid #edf1f4}.total-line:last-child{border-bottom:0}.total-line span{color:var(--muted)}.total-line b{font-weight:700;color:var(--ink);white-space:nowrap}.total-line.grand{margin:4px -5px;padding:12px 8px;background:var(--pale);border-radius:7px}.total-line.grand span,.total-line.grand b{color:var(--navy);font-weight:800;font-size:15px}.total-line.balance b{color:' + (balance > 0 ? '#9b5b22' : '#26744d') + '}' +
'.status{display:inline-block;border-radius:3px;padding:4px 11px;font-size:11px;font-weight:700;border:1px solid currentColor;background:' + statusColor + ';color:' + statusTextColor + '}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:45px;margin-top:42px}.signature{text-align:center;padding-top:12px;border-top:1px dashed #9cabb7;color:var(--muted);font-size:11px}.footer{margin-top:36px;padding-top:13px;border-top:1px solid var(--line);text-align:center;color:var(--muted);font-size:10px}.footer strong{display:block;color:var(--navy);font-size:12px;margin-bottom:3px}' +
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
  const [user, setUser] = useState<AppUser | null>(null)
  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [guestBusy, setGuestBusy] = useState(false)
  useEffect(() => {
    if (isDesktopApp()) {
      let active = true
      void getDesktopLocalSession().then(session => {
        if (!active) return
        setUser(session ? { id: session.ownerId } : null)
        setChecking(false)
      }).catch(() => { if (active) setChecking(false) })
      return () => { active = false }
    }
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
  const signInAsGuest = async () => {
    setGuestBusy(true)
    setMessage('')
    const { error } = await supabase.auth.signInAnonymously()
    setGuestBusy(false)
    if (error) setMessage('تعذر الدخول كزائر: ' + error.message)
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
    <button className="primary-btn auth-submit" disabled={busy || guestBusy}>{busy ? 'جارٍ التنفيذ...' : mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}</button>
    {mode === 'login' && <>
      <div className="auth-divider"><span>أو</span></div>
      <button type="button" className="guest-btn" disabled={busy || guestBusy} onClick={signInAsGuest}>{guestBusy ? 'جارٍ الدخول كزائر...' : 'الدخول كزائر بدون إيميل أو باسورد'}</button>
    </>}
    <button type="button" className="text-button auth-toggle" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage('') }}>{mode === 'login' ? 'أول مرة؟ أنشئ حسابًا' : 'لديك حساب؟ سجّل الدخول'}</button>
  </form></div>
}
