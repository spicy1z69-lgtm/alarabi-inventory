

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { getDesktopLocalSession, isDesktopApp, readDesktopState, writeDesktopStateBundle } from './lib/desktopStorage'
import alarabiLogoDataUrl from './assets/alarabi-logo.jpg?inline'
import alarabiWatermarkDataUrl from './assets/alarabi-watermark.png?inline'

import { supabase } from './lib/supabase'
import {
  Boxes, LayoutDashboard, Package, FileText, Search, Plus, Pencil, Copy,
  Trash2, AlertTriangle, TrendingUp, X, Printer, Check, ClipboardList, Receipt, CircleDollarSign, Wallet, ArrowDownLeft, ArrowUpRight, Download, CalendarCheck, Upload, RotateCcw, MessageCircle, Users, History, Settings,
} from 'lucide-react'
import type { Product, Quote, QuoteItem, Invoice } from './types'
import { cashDifferenceFor, invoiceGrandTotalFor, invoiceTaxFor, itemsSubtotalFor, lineTotalFor, outstandingBalanceFor, roundMoney, weightedAverageCostFor } from './lib/money'

const COMPANY = 'مؤسسة العربي لأنظمة التأريض'
const INVOICE_COMPANY = COMPANY
const COMPANY_ADDRESS = 'وسط البلد · 15 سليمان الحلبي · الجيلي مول · الدور الثاني'
const CONTACTS = [
  { name: 'Ahmed Elsaeed', phone: '01094990377' },
  { name: 'Ali Elyamany', phone: '01064227445' },
]
const COMPANY_EMAIL = 'alarabi.company5@gmail.com'
type CompanySettings = { name: string; address: string; email: string; contact1Name: string; contact1Phone: string; contact2Name: string; contact2Phone: string; logoDataUrl?: string }
const DEFAULT_COMPANY_SETTINGS: CompanySettings = { name: COMPANY, address: COMPANY_ADDRESS, email: COMPANY_EMAIL, contact1Name: CONTACTS[0].name, contact1Phone: CONTACTS[0].phone, contact2Name: CONTACTS[1].name, contact2Phone: CONTACTS[1].phone }
type ActivityItem = { id: string; date: string; action: string; reference?: string; detail?: string }

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
const addDaysToDate = (date: string, days: number) => {
  const value = new Date(date + 'T12:00:00')
  value.setDate(value.getDate() + days)
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
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

type SupplierDebtPayment = { id: string; amount: number; date: string; note: string }
type SupplierDebt = { id: string; supplier: string; phone: string; reference: string; description: string; amount: number; date: string; dueDate: string; payments: SupplierDebtPayment[] }
type CashEntry = { id: string; kind: 'in' | 'out'; amount: number; category: string; note: string; date: string; invoiceId?: string; supplierDebtPaymentId?: string; purchaseId?: string }
type StockMovement = { id: string; productId: string; productName: string; kind: 'in' | 'out'; quantity: number; reason: string; reference: string; date: string; quantityBefore?: number; quantityAfter?: number }
type DiscountTemplate = { id: string; name: string; kind: 'amount' | 'percent'; value: number }
type CustomerPrice = { customer: string; productId: string; price?: number; discountPercent?: number }
type Operations = { purchases: Array<{id:string;date:string;supplier:string;productId:string;productName:string;quantity:number;unitCost:number;paid:number;total:number}>; returns: Array<{id:string;date:string;invoiceId:string;invoiceNumber:string;customer:string;amount:number;refundedAmount?:number;items?:Array<{productId:string;productName:string;quantity:number}>}>; cashCounts: Array<{id:string;date:string;expected:number;actual:number;difference:number}>; activity?: ActivityItem[]; companySettings?: CompanySettings; monthlyTargets?:Record<string,number>; customerPrices?:CustomerPrice[]; discountTemplates?:DiscountTemplate[]; monthCloses?:Array<{month:string;closedAt:string;invoiceCount:number;sales:number;collected:number;expenses:number;profit:number}> }
const emptyOperations = (): Operations => ({ purchases: [], returns: [], cashCounts: [], activity: [], companySettings: DEFAULT_COMPANY_SETTINGS, monthlyTargets: {}, customerPrices: [], discountTemplates: [{ id: 'discount-5', name: 'خصم 5%', kind: 'percent', value: 5 }, { id: 'discount-10', name: 'خصم 10%', kind: 'percent', value: 10 }], monthCloses: [] })
const normalizeOperations = (value?: Partial<Operations>): Operations => ({ ...emptyOperations(), ...(value || {}), purchases: value?.purchases || [], returns: value?.returns || [], cashCounts: value?.cashCounts || [], activity: value?.activity || [], companySettings: { ...DEFAULT_COMPANY_SETTINGS, ...(value?.companySettings || {}) }, monthlyTargets: value?.monthlyTargets || {}, customerPrices: value?.customerPrices || [], discountTemplates: value?.discountTemplates?.length ? value.discountTemplates : emptyOperations().discountTemplates, monthCloses: value?.monthCloses || [] })
type Tab = 'dashboard' | 'products' | 'quotes' | 'invoices' | 'cash' | 'debts' | 'reports' | 'customers' | 'activity' | 'settings'

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
  const [quoteFrom, setQuoteFrom] = useState('')
  const [quoteTo, setQuoteTo] = useState('')
  const [reportKind, setReportKind] = useState<'sales' | 'cash' | 'inventory'>('sales')
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<'all' | Invoice['status'] | 'returned'>('all')
  const [reportCategoryFilter, setReportCategoryFilter] = useState('all')
  const [cloudLoaded, setCloudLoaded] = useState(false)
  const [cloudError, setCloudError] = useState('')
  const [localSaveStatus, setLocalSaveStatus] = useState<'saving' | 'saved' | 'error'>('saving')
  const localSaveRevision = useRef(0)
  const [products, setProducts] = useState<Product[]>(() =>
    []
  )
  const [quotes, setQuotes] = useState<Quote[]>(() =>
    []
  )
  const [invoices, setInvoices] = useState<Invoice[]>(() => [])
  const [cashEntries, setCashEntries] = useState<CashEntry[]>(() => [])
  const [supplierDebts, setSupplierDebts] = useState<SupplierDebt[]>([])
  const [debtSupplier, setDebtSupplier] = useState('')
  const [debtPhone, setDebtPhone] = useState('')
  const [debtReference, setDebtReference] = useState('')
  const [debtDescription, setDebtDescription] = useState('')
  const [debtAmount, setDebtAmount] = useState('')
  const [debtDate, setDebtDate] = useState(today())
  const [debtDueDate, setDebtDueDate] = useState('')
  const [payingDebtId, setPayingDebtId] = useState('')
  const [debtPaymentAmount, setDebtPaymentAmount] = useState('')
  const [debtPaymentNote, setDebtPaymentNote] = useState('')
  const [debtSearch, setDebtSearch] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const supplierPaymentLock = useRef(false)
  useEffect(() => { if (!payingDebtId) supplierPaymentLock.current = false }, [payingDebtId])
  const [stockMovements, setStockMovements] = useState<StockMovement[]>(() => [])
  const [operations, setOperations] = useState<Operations>(() => emptyOperations())
  const [companySettings, setCompanySettings] = useState<CompanySettings>(() => DEFAULT_COMPANY_SETTINGS)
  const [savedDrafts, setSavedDrafts] = useState<{ invoice?: { customer: string; phone: string; dueDate: string; discount: string; tax: string; paid: string; notes: string; rows: QuoteItem[] }; quote?: { customer: string; phone: string; followUpDate: string; rows: QuoteItem[] } }>(() => load('alarabi-form-drafts-' + user.id, {}))
  const [purchaseSupplier, setPurchaseSupplier] = useState('')
  const [purchaseProductId, setPurchaseProductId] = useState('')
  const [purchaseQuantity, setPurchaseQuantity] = useState('')
  const [purchaseCost, setPurchaseCost] = useState('')
  const [purchasePaid, setPurchasePaid] = useState('')
  const [cashCountActual, setCashCountActual] = useState('')
  const desktopStateRef = useRef<Array<{ key: string; value: unknown }>>([])
  desktopStateRef.current = [
    { key: 'products', value: products },
    { key: 'quotes', value: quotes },
    { key: 'invoices', value: invoices },
    { key: 'cash', value: cashEntries },
    { key: 'supplier-debts', value: supplierDebts },
    { key: 'stock-movements', value: stockMovements },
    { key: 'operations', value: operations },
  ]
  const [cashModal, setCashModal] = useState(false)
  const [cashKind, setCashKind] = useState<'in' | 'out'>('in')
  const [cashAmount, setCashAmount] = useState('')
  const [cashCategory, setCashCategory] = useState('')
  const [cashNote, setCashNote] = useState('')
  const [invoiceModal, setInvoiceModal] = useState(false)
  const [convertingQuoteId, setConvertingQuoteId] = useState<string | null>(null)
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [returnInvoiceDraft, setReturnInvoiceDraft] = useState<Invoice | null>(null)
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({})
  const [invoiceCustomer, setInvoiceCustomer] = useState('')
  const [invoicePhone, setInvoicePhone] = useState('')
  const [invoiceDueDate, setInvoiceDueDate] = useState('')
  const [invoiceDiscount, setInvoiceDiscount] = useState('0')
  const [invoiceTax, setInvoiceTax] = useState('0')
  const [invoiceStatus, setInvoiceStatus] = useState<'paid' | 'unpaid' | 'partial'>('unpaid')
  const [invoicePaid, setInvoicePaid] = useState('0')
  const [invoiceNotes, setInvoiceNotes] = useState('')
  const [query, setQuery] = useState('')
  const [archiveQuery, setArchiveQuery] = useState('')
  const [quickSearchOpen, setQuickSearchOpen] = useState(false)
  const [quickSearchQuery, setQuickSearchQuery] = useState('')
  const [productModal, setProductModal] = useState<Product | null | 'new'>(null)
  const [quoteModal, setQuoteModal] = useState(false)
  const [notice, setNotice] = useState('')
  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(''), 4000)
    return () => window.clearTimeout(timeout)
  }, [notice])
  const [customer, setCustomer] = useState('')
  const [quotePhone, setQuotePhone] = useState('')
  const [quoteFollowUpDate, setQuoteFollowUpDate] = useState('')
  const [quoteRows, setQuoteRows] = useState<QuoteItem[]>([])
  const [draft, setDraft] = useState({
    code: '',
    name: '',
    category: '',
    quantity: '0',
    price: '0',
    costPrice: '0',
    minStock: '2',
    targetStock: '10',
    location: '',
  })
  const [stockMovementModal, setStockMovementModal] = useState(false)
  const [stocktakeOpen, setStocktakeOpen] = useState(false)
  const [stocktakeCounts, setStocktakeCounts] = useState<Record<string, string>>({})
  const [movementProductId, setMovementProductId] = useState('')
  const [movementKind, setMovementKind] = useState<'in' | 'out'>('in')
  const [movementQuantity, setMovementQuantity] = useState('')
  const [movementReason, setMovementReason] = useState('')
  const [movementReference, setMovementReference] = useState('')
  const [movementKindFilter, setMovementKindFilter] = useState<'all' | 'in' | 'out'>('all')
  const [movementFromDate, setMovementFromDate] = useState('')
  const [movementToDate, setMovementToDate] = useState('')
  const [selectedMovementProductId, setSelectedMovementProductId] = useState('')
  const [bulkPriceCategory, setBulkPriceCategory] = useState('all')
  const [bulkPricePercent, setBulkPricePercent] = useState('')
  const [bulkPricePreview, setBulkPricePreview] = useState<Array<{product: Product; before: number; after: number}> | null>(null)
  const [customerTermName, setCustomerTermName] = useState('')
  const [customerTermProductId, setCustomerTermProductId] = useState('')
  const [customerTermPrice, setCustomerTermPrice] = useState('')
  const [monthlyGoalDraft, setMonthlyGoalDraft] = useState('')
  const [discountTemplateName, setDiscountTemplateName] = useState('')
  const [discountTemplateValue, setDiscountTemplateValue] = useState('')

  useEffect(() => {
    localStorage.setItem('alarabi-form-drafts-' + user.id, JSON.stringify(savedDrafts))
  }, [savedDrafts, user.id])
  useEffect(() => {
    if (!cloudLoaded) return
    setOperations(old => old.companySettings === companySettings ? old : { ...old, companySettings })
  }, [companySettings, cloudLoaded])
  useEffect(() => {
    if (invoiceModal) setSavedDrafts(old => ({ ...old, invoice: { customer: invoiceCustomer, phone: invoicePhone, dueDate: invoiceDueDate, discount: invoiceDiscount, tax: invoiceTax, paid: invoicePaid, notes: invoiceNotes, rows: quoteRows } }))
  }, [invoiceModal, invoiceCustomer, invoicePhone, invoiceDueDate, invoiceDiscount, invoiceTax, invoicePaid, invoiceNotes, quoteRows])
  useEffect(() => {
    if (quoteModal) setSavedDrafts(old => ({ ...old, quote: { customer, phone: quotePhone, followUpDate: quoteFollowUpDate, rows: quoteRows } }))
  }, [quoteModal, customer, quotePhone, quoteFollowUpDate, quoteRows])

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
          setSupplierDebts((localValues.get('supplier-debts') as SupplierDebt[] | undefined) ?? [])
          setStockMovements((localValues.get('stock-movements') as StockMovement[] | undefined) ?? [])
          const loadedOperations = normalizeOperations(localValues.get('operations') as Operations | undefined)
          setOperations(loadedOperations)
          setCompanySettings(loadedOperations.companySettings || DEFAULT_COMPANY_SETTINGS)
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
        { key: 'supplier-debts', localKey: 'alarabi-supplier-debts', fallback: isOwnerAccount ? load('alarabi-supplier-debts', []) : [] as SupplierDebt[], setter: setSupplierDebts },
        { key: 'stock-movements', localKey: 'alarabi-stock-movements', fallback: isOwnerAccount ? load('alarabi-stock-movements', []) : [] as StockMovement[], setter: setStockMovements },
        { key: 'operations', localKey: 'alarabi-operations', fallback: isOwnerAccount ? load('alarabi-operations', emptyOperations()) : emptyOperations(), setter: (value: Operations) => { const normalized = normalizeOperations(value); setOperations(normalized); setCompanySettings(normalized.companySettings || DEFAULT_COMPANY_SETTINGS) } },
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
    if (isDesktopApp()) return
    if (user.id === '9301075f-da3f-438e-acb6-43fd0af65a41') localStorage.setItem('alarabi-products', JSON.stringify(products))
    void supabase.from('app_state').upsert({ owner_id: user.id, state_key: 'products', state_value: products, updated_at: new Date().toISOString() }, { onConflict: 'owner_id,state_key' }).then(({ error }) => { if (error) setCloudError('مشكلة في حفظ الأصناف سحابيًا: ' + error.message) })
  }, [products, cloudLoaded, user.id])

  useEffect(() => {
    if (!cloudLoaded) return
    if (isDesktopApp()) return
    if (user.id === '9301075f-da3f-438e-acb6-43fd0af65a41') localStorage.setItem('alarabi-quotes', JSON.stringify(quotes))
    void supabase.from('app_state').upsert({ owner_id: user.id, state_key: 'quotes', state_value: quotes, updated_at: new Date().toISOString() }, { onConflict: 'owner_id,state_key' }).then(({ error }) => { if (error) setCloudError('مشكلة في حفظ عروض الأسعار سحابيًا: ' + error.message) })
  }, [quotes, cloudLoaded, user.id])

  useEffect(() => {
    if (!cloudLoaded) return
    if (isDesktopApp()) return
    if (user.id === '9301075f-da3f-438e-acb6-43fd0af65a41') localStorage.setItem('alarabi-invoices', JSON.stringify(invoices))
    void supabase.from('app_state').upsert({ owner_id: user.id, state_key: 'invoices', state_value: invoices, updated_at: new Date().toISOString() }, { onConflict: 'owner_id,state_key' }).then(({ error }) => { if (error) setCloudError('مشكلة في حفظ الفواتير سحابيًا: ' + error.message) })
  }, [invoices, cloudLoaded, user.id])

  useEffect(() => {
    if (!cloudLoaded) return
    if (isDesktopApp()) return
    if (user.id === '9301075f-da3f-438e-acb6-43fd0af65a41') localStorage.setItem('alarabi-cash', JSON.stringify(cashEntries))
    void supabase.from('app_state').upsert({ owner_id: user.id, state_key: 'cash', state_value: cashEntries, updated_at: new Date().toISOString() }, { onConflict: 'owner_id,state_key' }).then(({ error }) => { if (error) setCloudError('مشكلة في حفظ حركة الخزنة سحابيًا: ' + error.message) })
  }, [cashEntries, cloudLoaded, user.id])

  useEffect(() => {
    if (!cloudLoaded) return
    if (isDesktopApp()) return
    if (user.id === '9301075f-da3f-438e-acb6-43fd0af65a41') localStorage.setItem('alarabi-supplier-debts', JSON.stringify(supplierDebts))
    void supabase.from('app_state').upsert({ owner_id: user.id, state_key: 'supplier-debts', state_value: supplierDebts, updated_at: new Date().toISOString() }, { onConflict: 'owner_id,state_key' }).then(({ error }) => { if (error) setCloudError('مشكلة في حفظ ديون الموردين: ' + error.message) })
  }, [supplierDebts, cloudLoaded, user.id])

  const debtPaid = (debt: SupplierDebt) => (debt.payments || []).reduce((sum, payment) => sum + payment.amount, 0)
  const debtRemaining = (debt: SupplierDebt) => Math.max(0, debt.amount - debtPaid(debt))
  const filteredSupplierDebts = supplierDebts.filter(debt => (debt.supplier + ' ' + debt.phone + ' ' + debt.reference + ' ' + debt.description).toLowerCase().includes(debtSearch.trim().toLowerCase()))
  const overdueSupplierDebts = supplierDebts.filter(debt => debtRemaining(debt) > 0 && debt.dueDate && debt.dueDate < today())
  const addSupplierDebt = () => {
    const amount = roundMoney(Number(debtAmount))
    if (!debtSupplier.trim() || !Number.isFinite(amount) || amount <= 0 || !debtDate || !debtDueDate) { setNotice('اكتب اسم المورد والمبلغ وتاريخ الدين وموعد السداد بشكل صحيح'); return }
    setSupplierDebts(old => [{ id: crypto.randomUUID(), supplier: debtSupplier.trim(), phone: debtPhone.trim(), reference: debtReference.trim(), description: debtDescription.trim(), amount, date: debtDate, dueDate: debtDueDate, payments: [] }, ...old])
    logActivity('تسجيل دين مورد', debtSupplier.trim(), money(amount))
    setDebtSupplier(''); setDebtPhone(''); setDebtReference(''); setDebtDescription(''); setDebtAmount(''); setDebtDate(today()); setDebtDueDate('')
    setNotice('تم تسجيل دين المورد وحفظه في السجل')
  }
  const recordSupplierDebtPayment = () => {
    if (supplierPaymentLock.current) return
    const debt = supplierDebts.find(item => item.id === payingDebtId); const amount = roundMoney(Number(debtPaymentAmount))
    if (!debt || !Number.isFinite(amount) || amount <= 0 || amount > debtRemaining(debt)) { setNotice('اكتب مبلغ سداد صحيح لا يتجاوز المتبقي'); return }
    supplierPaymentLock.current = true
    const paymentId = crypto.randomUUID(); const payment = { id: paymentId, amount, date: today(), note: debtPaymentNote.trim() }
    setSupplierDebts(old => old.map(item => item.id === debt.id ? { ...item, payments: [...(item.payments || []), payment] } : item))
    setCashEntries(old => [{ id: crypto.randomUUID(), kind: 'out', amount, category: 'سداد دين مورد', note: `${debt.supplier}${debt.reference ? ' — ' + debt.reference : ''}${debtPaymentNote.trim() ? ' — ' + debtPaymentNote.trim() : ''}`, date: today(), supplierDebtPaymentId: paymentId }, ...old])
    logActivity('سداد دين مورد', debt.supplier, money(amount))
    setPayingDebtId(''); setDebtPaymentAmount(''); setDebtPaymentNote(''); setNotice('تم تسجيل السداد مرة واحدة وربطه بالخزنة ودين المورد')
  }
  const printSupplierDebtStatement = (debt: SupplierDebt) => {
    const esc = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;')
    const rows = (debt.payments || []).map(payment => `<tr><td>${esc(payment.date)}</td><td>سداد</td><td>${esc(payment.note || '—')}</td><td>${money(payment.amount)}</td></tr>`).join('')
    const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>كشف حساب مورد - ${esc(debt.supplier)}</title><style>body{font:13px Tahoma,Arial;color:#253746;padding:24px}h1{color:#173653}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #d9e2e9;padding:9px;text-align:right}th{background:#173653;color:white}.summary{padding:14px;background:#eef4f8;margin:16px 0}@page{size:A4;margin:14mm}</style></head><body><h1>العربي لأنظمة التأريض</h1><h2>كشف حساب مورد</h2><p>المورد: ${esc(debt.supplier)} | الهاتف: ${esc(debt.phone || '—')}</p><p>مرجع الدين: ${esc(debt.reference || '—')} | البيان: ${esc(debt.description || '—')}</p><div class="summary">قيمة الدين: ${money(debt.amount)} — المدفوع: ${money(debtPaid(debt))} — المتبقي: ${money(debtRemaining(debt))}<br>تاريخ التسجيل: ${esc(debt.date)} — موعد السداد: ${esc(debt.dueDate)}</div><table><thead><tr><th>التاريخ</th><th>الحركة</th><th>ملاحظات</th><th>المبلغ</th></tr></thead><tbody><tr><td>${esc(debt.date)}</td><td>تسجيل الدين</td><td>${esc(debt.description || debt.reference || '—')}</td><td>${money(debt.amount)}</td></tr>${rows}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`
    const win = window.open('', '_blank'); if (!win) { setNotice('اسمح بفتح النوافذ المنبثقة لطباعة كشف الحساب'); return }
    win.document.write(html); win.document.close()
  }

  const cashIn = cashEntries.filter(e => e.kind === 'in').reduce((s, e) => s + e.amount, 0)
  const cashOut = cashEntries.filter(e => e.kind === 'out').reduce((s, e) => s + e.amount, 0)
  const cashBalance = roundMoney(cashIn - cashOut)
  const expenseTotal = roundMoney(cashEntries.filter(entry => entry.kind === 'out' && !entry.supplierDebtPaymentId && entry.category !== 'شراء بضاعة' && entry.category !== 'رد قيمة مرتجع').reduce((sum, entry) => sum + entry.amount, 0))

  const exportBackup = () => {
    const backup = {
      company: companySettings.name,
      exportedAt: new Date().toISOString(),
      version: 1,
      data: { products, quotes, invoices, cashEntries, stockMovements, supplierDebts, operations },
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
  const exportEndOfDay = () => {
    const date = today()
    const dailyInvoices = invoices.filter(invoice => invoice.date === date)
    const dailyReturns = (operations.returns || []).filter(record => record.date === date)
    const dailyQuotes = quotes.filter(quote => quote.date === date)
    const dailyCash = cashEntries.filter(entry => entry.date === date)
    const dailyStockMovements = stockMovements.filter(movement => movement.date === date)
    const dailySupplierDebts = supplierDebts
      .map(debt => ({ ...debt, payments: (debt.payments || []).filter(payment => payment.date === date) }))
      .filter(debt => debt.date === date || debt.payments.length > 0)
    const cashIn = dailyCash.filter(entry => entry.kind === 'in').reduce((sum, entry) => sum + entry.amount, 0)
    const cashOut = dailyCash.filter(entry => entry.kind === 'out').reduce((sum, entry) => sum + entry.amount, 0)
    const openingCash = cashEntries.filter(entry => entry.date < date).reduce((sum, entry) => sum + (entry.kind === 'in' ? entry.amount : -entry.amount), 0)
    const dayTotal = roundMoney(dailyInvoices.reduce((sum, invoice) => sum + ((invoice as Invoice & { returned?: boolean }).returned ? 0 : invoiceTotalFor(invoice)), 0) - dailyReturns.reduce((sum, record) => sum + record.amount, 0))
    if (!window.confirm(`مراجعة إقفال يوم ${date}\nالفواتير: ${dailyInvoices.length}\nالمرتجعات: ${dailyReturns.length}\nالعروض: ${dailyQuotes.length}\nصافي المبيعات: ${money(dayTotal)}\nحركات الخزنة: ${dailyCash.length} (${money(cashIn - cashOut)})\nحركات المخزون: ${dailyStockMovements.length}\nبعد التأكيد سيتم تنزيل ملف بيانات اليوم.`)) return
    const bundle = {
      application: 'alarabisystem',
      company: companySettings.name,
      kind: 'end-of-day',
      date,
      closedAt: new Date().toISOString(),
      summary: {
        invoiceCount: dailyInvoices.length,
        invoiceTotal: dayTotal,
        quoteCount: dailyQuotes.length,
        cashIn,
        cashOut,
        cashNet: cashIn - cashOut,
        openingCash,
        closingCash: openingCash + cashIn - cashOut,
        inventoryUnits: products.reduce((sum, product) => sum + product.quantity, 0),
        inventoryCostValue: products.reduce((sum, product) => sum + product.quantity * (product.costPrice ?? 0), 0),
        stockMovementCount: dailyStockMovements.length,
        supplierDebtCount: dailySupplierDebts.length,
      },
      data: {
        invoices: dailyInvoices,
        quotes: dailyQuotes,
        cashEntries: dailyCash,
        stockMovements: dailyStockMovements,
        supplierDebts: dailySupplierDebts,
        operations: {
          purchases: operations.purchases.filter(item => item.date === date),
          returns: dailyReturns,
          cashCounts: operations.cashCounts.filter(item => item.date === date),
        },
        stockSnapshot: products,
      },
    }
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'alarabisystem-end-of-day-' + date + '.json'
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice('تم إنهاء اليوم وحفظ ملف بيانات يوم ' + date)
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
        (data.stockMovements !== undefined && !Array.isArray(data.stockMovements)) ||
        (data.supplierDebts !== undefined && !Array.isArray(data.supplierDebts)) ||
        (data.operations !== undefined && (!data.operations || !Array.isArray(data.operations.purchases) || !Array.isArray(data.operations.returns) || !Array.isArray(data.operations.cashCounts)))
      ) {
        setNotice('ملف النسخة الاحتياطية غير صالح أو ناقص')
        return
      }
      const preview = `محتويات الملف: ${data.products.length} صنف، ${data.invoices.length} فاتورة، ${data.quotes.length} عرض سعر، ${data.cashEntries.length} حركة خزنة.\n\nسيستبدل هذا بيانات البرنامج الحالية. هل تريد المتابعة؟`
      const confirmed = window.confirm(preview)
      if (!confirmed) return
      setProducts(data.products)
      setQuotes(data.quotes)
      setInvoices(data.invoices)
      setCashEntries(data.cashEntries)
      setStockMovements(Array.isArray(data.stockMovements) ? data.stockMovements : [])
      setSupplierDebts(Array.isArray(data.supplierDebts) ? data.supplierDebts : [])
      const restoredOperations = normalizeOperations(data.operations)
      setOperations(restoredOperations)
      setCompanySettings(restoredOperations.companySettings || DEFAULT_COMPANY_SETTINGS)
      setNotice('تم تحميل النسخة الاحتياطية. جاري حفظ البيانات')
    } catch {
      setNotice('تعذر قراءة الملف. تأكد أنه ملف نسخة احتياطية صحيح بصيغة JSON')
    } finally {
      event.target.value = ''
    }
  }

  const logActivity = (action: string, reference = '', detail = '') => {
    const item: ActivityItem = { id: crypto.randomUUID(), date: new Date().toISOString(), action, reference, detail }
    setOperations(old => ({ ...old, activity: [item, ...(old.activity || [])].slice(0, 500) }))
  }

  const addCashEntry = () => {
    const amount = roundMoney(Number(cashAmount))
    if (!Number.isFinite(amount) || amount <= 0 || !cashCategory.trim()) { setNotice('اكتب مبلغ صحيح وحدد البند'); return }
    setCashEntries(old => [{ id: crypto.randomUUID(), kind: cashKind, amount, category: cashCategory.trim(), note: cashNote.trim(), date: today() }, ...old])
    setCashAmount(''); setCashCategory(''); setCashNote(''); setCashModal(false)
    logActivity(cashKind === 'in' ? 'تسجيل مبلغ داخل' : 'تسجيل مصروف', cashCategory.trim(), money(amount))
    setNotice(cashKind === 'in' ? 'تم تسجيل المبلغ الداخل' : 'تم تسجيل المبلغ الخارج')
  }
  const deleteCashEntry = (entry: CashEntry) => {
    if (!window.confirm('حذف حركة الخزنة بقيمة ' + money(entry.amount) + '؟')) return
    setCashEntries(old => old.filter(e => e.id !== entry.id))
  }

  const restoreSavedDraft = (kind: 'invoice' | 'quote') => {
    if (kind === 'quote' && savedDrafts.quote) {
      setCustomer(savedDrafts.quote.customer); setQuotePhone(savedDrafts.quote.phone); setQuoteFollowUpDate(savedDrafts.quote.followUpDate); setQuoteRows(savedDrafts.quote.rows); setQuoteModal(true); setTab('quotes')
    } else if (kind === 'invoice' && savedDrafts.invoice) {
      const draftInvoice = savedDrafts.invoice
      setInvoiceCustomer(draftInvoice.customer); setInvoicePhone(draftInvoice.phone); setInvoiceDueDate(draftInvoice.dueDate); setInvoiceDiscount(draftInvoice.discount); setInvoiceTax(draftInvoice.tax); setInvoicePaid(draftInvoice.paid); setInvoiceNotes(draftInvoice.notes); setInvoiceStatus(Number(draftInvoice.paid) > 0 ? 'partial' : 'unpaid'); setQuoteRows(draftInvoice.rows); setInvoiceModal(true); setTab('invoices')
    }
  }

  const printReorderList = () => {
    const rows = reorderSuggestions.map(item => `<tr><td>${escapeHtml(item.product.code)}</td><td>${escapeHtml(item.product.name)}</td><td>${item.product.quantity}</td><td>${item.product.minStock}</td><td>${item.daysLeft === null ? '—' : item.daysLeft + ' يوم'}</td><td>${item.buyQuantity}</td></tr>`).join('')
    const html = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>قائمة شراء مقترحة</title><style>body{font:14px Tahoma;padding:24px;color:#222}h1{border-right:5px solid #ed5a20;padding-right:12px}table{border-collapse:collapse;width:100%;margin-top:20px}td,th{border:1px solid #bbb;padding:9px;text-align:right}th{background:#17191d;color:#fff}@page{size:A4 landscape;margin:12mm}</style><h1>قائمة شراء مقترحة — ${escapeHtml(companySettings.name)}</h1><p>التاريخ: ${today()} · الأصناف تحتاج مراجعة الكميات قبل طلبها.</p><table><thead><tr><th>الكود</th><th>الصنف</th><th>المتاح</th><th>حد التنبيه</th><th>النفاد المتوقع</th><th>كمية الشراء المقترحة</th></tr></thead><tbody>${rows || '<tr><td colspan="6">لا توجد أصناف مقترحة للشراء</td></tr>'}</tbody></table><script>window.onload=()=>window.print()</script></html>`
    printDocument(html, 'قائمة الشراء')
  }

  const printProductLabels = () => {
    const html = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>ملصقات الأسعار</title><style>body{font:700 13px Tahoma;padding:8mm;display:grid;grid-template-columns:repeat(3,1fr);gap:5mm}.label{border:1px dashed #333;padding:8mm 4mm;text-align:center;break-inside:avoid}.label b{font-size:16px}.code{direction:ltr;font-family:Arial;margin:3mm}.price{font-size:18px;color:#d54b1d;margin-top:4mm}@page{size:A4;margin:8mm}</style>${products.map(product=>`<article class="label"><b>${escapeHtml(product.name)}</b><div class="code">${escapeHtml(product.code)}</div><div>${escapeHtml(product.location || 'موقع التخزين غير محدد')}</div><div class="price">${money(product.price)}</div></article>`).join('')}<script>window.onload=()=>window.print()</script></html>`
    printDocument(html, 'ملصقات الأسعار')
  }

  const buildBulkPricePreview = () => {
    const percentage = Number(bulkPricePercent)
    if (!bulkPricePercent.trim() || !Number.isFinite(percentage) || percentage < -90 || percentage > 500) { setNotice('أدخل نسبة تغيير من -90% إلى 500%'); return }
    const targets = products.filter(product => bulkPriceCategory === 'all' || product.category === bulkPriceCategory)
    if (!targets.length) { setNotice('لا توجد أصناف ضمن الفئة المختارة'); return }
    setBulkPricePreview(targets.map(product => ({ product, before: product.price, after: roundMoney(product.price * (1 + percentage / 100)) })))
  }

  const applyBulkPricePreview = () => {
    if (!bulkPricePreview?.length || !window.confirm(`تطبيق الأسعار الجديدة على ${bulkPricePreview.length} صنف؟ راجع المعاينة أولًا.`)) return
    const byId = new Map(bulkPricePreview.map(row => [row.product.id, row.after]))
    setProducts(old => old.map(product => byId.has(product.id) ? { ...product, price: byId.get(product.id)! } : product))
    logActivity('تعديل أسعار جماعي', bulkPriceCategory, bulkPricePreview.length + ' صنف')
    setNotice('تم تحديث الأسعار بعد مراجعة المعاينة')
    setBulkPricePreview(null); setBulkPricePercent('')
  }

  const saveMonthlyGoal = () => {
    const goal = roundMoney(Number(monthlyGoalDraft))
    if (!Number.isFinite(goal) || goal <= 0) { setNotice('أدخل هدف مبيعات شهريًا أكبر من صفر'); return }
    setOperations(old => ({ ...old, monthlyTargets: { ...(old.monthlyTargets || {}), [currentMonth]: goal } }))
    setMonthlyGoalDraft(''); setNotice('تم حفظ هدف المبيعات لهذا الشهر')
  }

  const saveCustomerPrice = () => {
    const customerName = customerTermName.trim(), product = products.find(item => item.id === customerTermProductId), price = roundMoney(Number(customerTermPrice))
    if (!customerName || !product || !customerTermPrice.trim() || !Number.isFinite(price) || price < 0) { setNotice('أدخل اسم العميل، الصنف والسعر المتفق عليه بشكل صحيح'); return }
    setOperations(old => ({ ...old, customerPrices: [...(old.customerPrices || []).filter(term => !(term.customer.toLocaleLowerCase() === customerName.toLocaleLowerCase() && term.productId === product.id)), { customer: customerName, productId: product.id, price }] }))
    setCustomerTermPrice(''); setNotice('تم حفظ السعر الخاص بالعميل')
  }

  const saveDiscountTemplate = () => {
    const value = Number(discountTemplateValue)
    if (!discountTemplateName.trim() || !Number.isFinite(value) || value <= 0 || value > 100) { setNotice('اكتب اسم الخصم ونسبة بين 0 و100'); return }
    const template: DiscountTemplate = { id: crypto.randomUUID(), name: discountTemplateName.trim(), kind: 'percent', value }
    setOperations(old => ({ ...old, discountTemplates: [...(old.discountTemplates || []), template] }))
    setDiscountTemplateName(''); setDiscountTemplateValue(''); setNotice('تم حفظ قالب الخصم')
  }

  const exportCustomerStatementExcel = async (customerName: string) => {
    const rows = activeInvoices.filter(invoice => invoice.customer.trim().toLocaleLowerCase() === customerName.trim().toLocaleLowerCase()).map(invoice => [invoice.date, invoice.number, netInvoiceTotalFor(invoice), invoicePaidAfterReturns(invoice), outstandingBalanceFor(netInvoiceTotalFor(invoice), invoicePaidAfterReturns(invoice))])
    try { const { default: ExcelJS } = await import('exceljs'); const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('كشف الحساب'); sheet.addRow(['التاريخ','رقم الفاتورة','الصافي بعد المرتجعات','المحصل بعد الرد','المتبقي']); sheet.addRows(rows); const buffer = await workbook.xlsx.writeBuffer(); const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); const link = document.createElement('a'); link.href = url; link.download = 'كشف-حساب-' + customerName.replace(/[\\/:*?"<>|]/g, '-') + '-' + today() + '.xlsx'; link.click(); URL.revokeObjectURL(url); setNotice('تم تصدير كشف حساب العميل إلى Excel') } catch (error) { setNotice('تعذر تصدير الكشف: ' + String(error)) }
  }

  const closeMonth = () => {
    if ((operations.monthCloses || []).some(close => close.month === currentMonth)) { setNotice('تم إقفال هذا الشهر بالفعل'); return }
    const expenses = roundMoney(cashEntries.filter(entry => entry.kind === 'out' && entry.date.startsWith(currentMonth) && !entry.supplierDebtPaymentId && entry.category !== 'شراء بضاعة' && entry.category !== 'رد قيمة مرتجع').reduce((sum, entry) => sum + entry.amount, 0))
    const monthlyReturns = (operations.returns || []).filter(record => record.date.startsWith(currentMonth))
    const revenueBeforeTax = thisMonthInvoices.reduce((sum, invoice) => sum + Math.max(0, itemsSubtotalFor(invoice.items) - (invoice.discount || 0)), 0)
    const costOfGoods = thisMonthInvoices.reduce((sum, invoice) => sum + invoice.items.reduce((lineSum, item) => lineSum + item.quantity * (item.costPrice || 0), 0), 0)
    const returnsBeforeTax = monthlyReturns.reduce((sum, record) => { const invoice = invoices.find(item => item.id === record.invoiceId); return sum + (invoice ? record.amount / (1 + Math.max(0, invoice.tax || 0) / 100) : record.amount) }, 0)
    const returnedCost = monthlyReturns.reduce((sum, record) => { const invoice = invoices.find(item => item.id === record.invoiceId); return sum + (record.items || []).reduce((lineSum, row) => lineSum + row.quantity * (invoice?.items.find(item => item.productId === row.productId)?.costPrice || 0), 0) }, 0)
    const profit = roundMoney(revenueBeforeTax - returnsBeforeTax - costOfGoods + returnedCost - expenses)
    const collected = roundMoney(cashEntries.filter(entry => entry.kind === 'in' && entry.date.startsWith(currentMonth)).reduce((sum, entry) => sum + entry.amount, 0))
    const snapshot = { month: currentMonth, closedAt: new Date().toISOString(), invoiceCount: thisMonthInvoices.length, sales: thisMonthSales, collected, expenses, profit }
    if (!window.confirm(`إقفال ${currentMonth}?\nالفواتير: ${snapshot.invoiceCount}\nالمبيعات: ${money(snapshot.sales)}\nالمصروفات: ${money(expenses)}\nالربح التقديري: ${money(profit)}\nسيتم حفظ لقطة مراجعة، مع بقاء السجلات قابلة للعرض.`)) return
    setOperations(old => ({ ...old, monthCloses: [snapshot, ...(old.monthCloses || [])] }))
    logActivity('إقفال شهر مالي', currentMonth, money(snapshot.sales))
    setNotice('تم حفظ لقطة إقفال الشهر')
  }

  const addInvoiceProduct = (product: Product) => {
    const term = operations.customerPrices?.find(item => item.customer.trim().toLocaleLowerCase() === invoiceCustomer.trim().toLocaleLowerCase() && item.productId === product.id)
    const rowPrice = term?.price ?? product.price
    setQuoteRows(old => {
      const existing = old.find(row => row.productId === product.id)
      return existing ? old.map(row => row.productId === product.id ? { ...row, quantity: row.quantity + 1, price: rowPrice } : row) : [...old, { productId: product.id, name: product.name, code: product.code, quantity: 1, price: rowPrice, costPrice: product.costPrice ?? 0 }]
    })
  }

  const updateCompanyField = (key: keyof CompanySettings, value: string) => setCompanySettings(old => ({ ...old, [key]: value }))
  const importCompanyLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('اختر صورة PNG أو JPG أو WebP أصغر من 5 ميجابايت')
      const logoDataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('تعذر قراءة الصورة')); reader.onerror = () => reject(new Error('تعذر قراءة الصورة')); reader.readAsDataURL(file) })
      setCompanySettings(old => ({ ...old, logoDataUrl }))
      logActivity('تغيير شعار الشركة', file.name)
      setNotice('تم حفظ شعار الشركة الجديد')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'تعذر حفظ الشعار') }
    finally { event.target.value = '' }
  }

  useEffect(() => {
    if (!cloudLoaded) return
    if (isDesktopApp()) return
    if (user.id === '9301075f-da3f-438e-acb6-43fd0af65a41') localStorage.setItem('alarabi-stock-movements', JSON.stringify(stockMovements))
    void supabase.from('app_state').upsert({ owner_id: user.id, state_key: 'stock-movements', state_value: stockMovements, updated_at: new Date().toISOString() }, { onConflict: 'owner_id,state_key' }).then(({ error }) => { if (error) setCloudError('مشكلة في حفظ سجل حركة المخزون: ' + error.message) })
  }, [stockMovements, cloudLoaded, user.id])

  useEffect(() => {
    if (!cloudLoaded || isDesktopApp()) return
    if (user.id === '9301075f-da3f-438e-acb6-43fd0af65a41') localStorage.setItem('alarabi-operations', JSON.stringify(operations))
    void supabase.from('app_state').upsert({ owner_id: user.id, state_key: 'operations', state_value: operations, updated_at: new Date().toISOString() }, { onConflict: 'owner_id,state_key' }).then(({ error }) => { if (error) setCloudError('مشكلة في حفظ سجل العمليات: ' + error.message) })
  }, [operations, cloudLoaded, user.id])

  useEffect(() => {
    if (!cloudLoaded || !isDesktopApp()) return
    const revision = ++localSaveRevision.current
    setLocalSaveStatus('saving')
    void writeDesktopStateBundle(desktopStateRef.current).then(() => {
      if (revision === localSaveRevision.current) setLocalSaveStatus('saved')
    }).catch(error => {
      if (revision === localSaveRevision.current) {
        setLocalSaveStatus('error')
        setCloudError('تعذر حفظ مجموعة بيانات المحل كاملة محليًا: ' + (error instanceof Error ? error.message : 'خطأ غير متوقع'))
      }
    })
  }, [products, quotes, invoices, cashEntries, supplierDebts, stockMovements, operations, cloudLoaded])

  useEffect(() => {
    if (!cloudLoaded || !isDesktopApp()) return
    const flushLatestState = () => {
      const result = window.alarabiDesktop!.writeStateBundleSync(desktopStateRef.current)
      if (!result.ok) console.error('تعذر حفظ آخر تغييرات المحل قبل الإغلاق:', result.error)
    }
    window.addEventListener('beforeunload', flushLatestState)
    return () => window.removeEventListener('beforeunload', flushLatestState)
  }, [cloudLoaded])

  const inventoryValue = products.reduce(
    (sum, p) => sum + p.quantity * p.price,
    0
  )

  const lowStock = products.filter(p => p.quantity <= p.minStock)
  const activeInvoices = invoices.filter(invoice => !(invoice as Invoice & { returned?: boolean }).returned)
  const recentSales = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() - (6 - index))
    const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
    const sales = activeInvoices.filter(invoice => invoice.date === key).reduce((sum, invoice) => sum + invoiceTotalFor(invoice), 0)
    const returns = (operations.returns || []).filter(record => record.date === key).reduce((sum, record) => sum + record.amount, 0)
    return { date: key, label: date.toLocaleDateString('ar-EG', { weekday: 'short' }), total: roundMoney(Math.max(0, sales - returns)) }
  })
  const bestSellingProducts = activeInvoices.reduce((totals, invoice) => { for (const item of invoice.items || []) { const returned = (operations.returns || []).flatMap(record => record.invoiceId === invoice.id ? record.items || [] : []).filter(row => row.productId === item.productId).reduce((sum, row) => sum + row.quantity, 0); totals.set(item.productId, (totals.get(item.productId) || 0) + Math.max(0, item.quantity - returned)) } return totals }, new Map<string, number>())
  const topProducts = [...bestSellingProducts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([id,quantity])=>({name: products.find(p=>p.id===id)?.name || activeInvoices.flatMap(i=>i.items||[]).find(item=>item.productId===id)?.name || 'صنف محذوف', quantity}))
  const maxDailySales = Math.max(1, ...recentSales.map(day=>day.total))
  const invoiceReturns = (invoiceId: string) => (operations.returns || []).filter(item => item.invoiceId === invoiceId)
  const returnedQuantityFor = (invoice: Invoice, productId: string) => invoiceReturns(invoice.id).flatMap(record => record.items || []).filter(row => row.productId === productId).reduce((sum, row) => sum + row.quantity, 0)
  const netInvoiceTotalFor = (invoice: Invoice) => (invoice as Invoice & { returned?: boolean }).returned ? 0 : roundMoney(Math.max(0, invoiceTotalFor(invoice) - invoiceReturns(invoice.id).reduce((sum, item) => sum + item.amount, 0)))
  const invoicePaidAfterReturns = (invoice: Invoice) => (invoice as Invoice & { returned?: boolean }).returned ? 0 : roundMoney(Math.max(0, (invoice.paidAmount || 0) - invoiceReturns(invoice.id).reduce((sum, item) => sum + Math.min(item.amount, item.refundedAmount ?? 0), 0)))
  const reportInvoiceTotalFor = (invoice: Invoice) => {
    if (reportCategoryFilter === 'all') return netInvoiceTotalFor(invoice)
    const rows = (invoice.items || []).filter(row => products.find(product => product.id === row.productId)?.category === reportCategoryFilter)
    const allSubtotal = itemsSubtotalFor(invoice.items || []), subtotal = itemsSubtotalFor(rows)
    if (!subtotal || !allSubtotal) return 0
    const discount = roundMoney(Math.min(subtotal, (invoice.discount || 0) * subtotal / allSubtotal))
    const categoryReturns = invoiceReturns(invoice.id).reduce((sum, record) => {
      const returnedBase = (record.items || []).filter(returned => products.find(product => product.id === returned.productId)?.category === reportCategoryFilter).reduce((lineSum, returned) => {
        const item = invoice.items.find(row => row.productId === returned.productId)
        return lineSum + (item?.price || 0) * returned.quantity
      }, 0)
      const allocatedDiscount = allSubtotal > 0 ? (invoice.discount || 0) * returnedBase / allSubtotal : 0
      return sum + (returnedBase > 0 ? invoiceGrandTotalFor(returnedBase, allocatedDiscount, invoice.tax) : 0)
    }, 0)
    return roundMoney(Math.max(0, invoiceGrandTotalFor(subtotal, discount, invoice.tax) - categoryReturns))
  }
  const reportInvoicePaidFor = (invoice: Invoice) => {
    const invoiceTotal = netInvoiceTotalFor(invoice), categoryTotal = reportInvoiceTotalFor(invoice)
    return invoiceTotal > 0 ? roundMoney(Math.min(categoryTotal, invoicePaidAfterReturns(invoice) * categoryTotal / invoiceTotal)) : 0
  }
  const reportInvoices = activeInvoices.filter(i => (!reportFrom || i.date >= reportFrom) && (!reportTo || i.date <= reportTo) && (reportCategoryFilter === 'all' || (i.items || []).some(row => products.find(p => p.id === row.productId)?.category === reportCategoryFilter)))
  const reportCash = cashEntries.filter(e => (!reportFrom || e.date >= reportFrom) && (!reportTo || e.date <= reportTo))
  const reportSales = reportInvoices.reduce((sum, i) => sum + reportInvoiceTotalFor(i), 0)
  const reportCollected = reportInvoices.reduce((sum, i) => sum + reportInvoicePaidFor(i), 0)
  const reportBalance = reportInvoices.reduce((sum, i) => sum + outstandingBalanceFor(reportInvoiceTotalFor(i), reportInvoicePaidFor(i)), 0)
  const reportCashIn = reportCash.filter(e => e.kind === 'in').reduce((sum, e) => sum + e.amount, 0)
  const reportCashOut = reportCash.filter(e => e.kind === 'out').reduce((sum, e) => sum + e.amount, 0)
  const totalInvoiceSales = activeInvoices.reduce((sum, invoice) => sum + netInvoiceTotalFor(invoice), 0)
  const totalCollected = activeInvoices.reduce((sum, invoice) => sum + Math.min(netInvoiceTotalFor(invoice), invoicePaidAfterReturns(invoice)), 0)
  const customerBalances = activeInvoices.reduce((sum, invoice) => sum + outstandingBalanceFor(netInvoiceTotalFor(invoice), invoicePaidAfterReturns(invoice)), 0)
  const currentMonth = today().slice(0, 7)
  const previousMonthDate = new Date(); previousMonthDate.setDate(1); previousMonthDate.setMonth(previousMonthDate.getMonth() - 1)
  const previousMonth = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, '0')}`
  const thisMonthInvoices = activeInvoices.filter(invoice => invoice.date.startsWith(currentMonth))
  const previousMonthInvoices = activeInvoices.filter(invoice => invoice.date.startsWith(previousMonth))
  const salesInMonth = (month: string) => roundMoney(Math.max(0,
    activeInvoices.filter(invoice => invoice.date.startsWith(month)).reduce((sum, invoice) => sum + invoiceTotalFor(invoice), 0) -
    (operations.returns || []).filter(record => record.date.startsWith(month)).reduce((sum, record) => sum + record.amount, 0)
  ))
  const thisMonthSales = salesInMonth(currentMonth)
  const previousMonthSales = salesInMonth(previousMonth)
  const monthlySalesTarget = operations.monthlyTargets?.[currentMonth] || 0
  const monthlyGoalProgress = monthlySalesTarget > 0 ? Math.max(0, Math.min(100, thisMonthSales / monthlySalesTarget * 100)) : 0
  const monthOverMonthChange = previousMonthSales > 0 ? roundMoney((thisMonthSales - previousMonthSales) / previousMonthSales * 100) : null
  const unpaidInvoices = activeInvoices.filter(invoice => netInvoiceTotalFor(invoice) > invoicePaidAfterReturns(invoice))
  const paidInvoiceCount = activeInvoices.filter(invoice => netInvoiceTotalFor(invoice) <= invoicePaidAfterReturns(invoice)).length
  // Only use cost snapshots stored on invoice lines. Falling back to today's
  // product cost would rewrite historical margins whenever a product is edited.
  const costCompleteInvoices = activeInvoices.filter(invoice =>
    (invoice.items || []).every(item => typeof item.costPrice === 'number' && item.costPrice > 0)
  )
  const knownCostSales = costCompleteInvoices.reduce((sum, invoice) =>
    sum + invoice.items.reduce((itemSum, item) => itemSum + Math.max(0, item.quantity - returnedQuantityFor(invoice, item.productId)) * (item.costPrice ?? 0), 0), 0)
  const hasMissingCosts = costCompleteInvoices.length !== activeInvoices.length
  const knownSalesBeforeTax = costCompleteInvoices.reduce((sum, invoice) => {
    const subtotal = itemsSubtotalFor(invoice.items)
    const returnedBase = invoice.items.reduce((lineSum, item) => lineSum + item.price * Math.min(item.quantity, returnedQuantityFor(invoice, item.productId)), 0)
    const retainedSubtotal = Math.max(0, subtotal - returnedBase)
    const retainedDiscount = subtotal > 0 ? Math.max(0, invoice.discount || 0) * retainedSubtotal / subtotal : 0
    return sum + Math.max(0, retainedSubtotal - retainedDiscount)
  }, 0)
  const estimatedGrossProfit = knownSalesBeforeTax - knownCostSales
  const knownNetProfit = roundMoney(estimatedGrossProfit - expenseTotal)
  const estimatedProfitMargin = knownSalesBeforeTax > 0 ? roundMoney(knownNetProfit / knownSalesBeforeTax * 100) : 0
  const activeOverdueQuotes = quotes.filter(quote => quote.status !== 'declined' && quote.status !== 'accepted' && quote.status !== 'expired' && quote.followUpDate && quote.followUpDate <= today() && !invoices.some(invoice => invoice.quoteId === quote.id || invoice.id === quote.convertedInvoiceId))
  const expiredQuotes = quotes.filter(quote => (quote.status === 'expired' || (quote.validUntil || addDaysToDate(quote.date, 7)) < today()) && !invoices.some(invoice => invoice.quoteId === quote.id || invoice.id === quote.convertedInvoiceId) && quote.status !== 'declined')
  const upcomingDueInvoices = activeInvoices.filter(invoice => invoice.dueDate && invoice.dueDate >= today() && invoice.dueDate <= addDaysToDate(today(), 7) && netInvoiceTotalFor(invoice) > invoicePaidAfterReturns(invoice))
  const dueCustomerInvoices = activeInvoices.filter(invoice => invoice.dueDate && invoice.dueDate < today() && netInvoiceTotalFor(invoice) > invoicePaidAfterReturns(invoice))
  const lowMarginRows = quoteRows.filter(row => typeof row.costPrice === 'number' && row.costPrice > row.price)
  const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const salesStart = new Date(thirtyDaysAgo.getTime() - thirtyDaysAgo.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
  const salesLast30Days = activeInvoices.filter(invoice => invoice.date >= salesStart && invoice.date <= today())
  const stockForecasts = products.map(product => {
    const unitsSold = salesLast30Days.reduce((sum, invoice) => sum + (invoice.items || []).filter(row => row.productId === product.id).reduce((qty, row) => qty + Math.max(0, row.quantity - (operations.returns || []).flatMap(record => record.invoiceId === invoice.id ? record.items || [] : []).filter(returned => returned.productId === product.id).reduce((total, returned) => total + returned.quantity, 0)), 0), 0)
    const dailyRate = unitsSold / 30
    return { product, unitsSold, dailyRate, daysLeft: dailyRate > 0 ? Math.floor(product.quantity / dailyRate) : null, buyQuantity: Math.max(0, (product.targetStock ?? Math.max(product.minStock + 1, product.minStock * 3)) - product.quantity) }
  })
  const reorderSuggestions = stockForecasts.filter(item => item.product.quantity <= item.product.minStock || (item.daysLeft !== null && item.daysLeft <= 14))
  const customerSummaries = Array.from(activeInvoices.reduce((map, invoice) => {
    const key = invoice.customer.trim().toLocaleLowerCase()
    const current = map.get(key) || { name: invoice.customer, invoices: 0, sales: 0, paid: 0, balance: 0, phone: invoice.phone || '' }
    current.invoices += 1
    current.sales += netInvoiceTotalFor(invoice)
    current.paid += Math.min(netInvoiceTotalFor(invoice), invoicePaidAfterReturns(invoice))
    current.balance += outstandingBalanceFor(netInvoiceTotalFor(invoice), invoicePaidAfterReturns(invoice))
    if (!current.phone && invoice.phone) current.phone = invoice.phone
    map.set(key, current)
    return map
  }, new Map<string, { name: string; invoices: number; sales: number; paid: number; balance: number; phone: string }>()).values()).sort((a, b) => b.balance - a.balance)
  const recentActivity: ActivityItem[] = [
    ...(operations.activity || []),
    ...activeInvoices.filter(invoice => !(operations.activity || []).some(item => item.reference === invoice.number)).map(invoice => ({ id: 'invoice-' + invoice.id, date: invoice.date, action: 'فاتورة بيع', reference: invoice.number, detail: invoice.customer })),
    ...quotes.filter(quote => !(operations.activity || []).some(item => item.reference === quote.number)).map(quote => ({ id: 'quote-' + quote.id, date: quote.date, action: 'عرض سعر', reference: quote.number, detail: quote.customer })),
    ...cashEntries.filter(entry => !(operations.activity || []).some(item => item.reference === entry.category && item.detail === money(entry.amount) && item.date.slice(0, 10) === entry.date)).map(entry => ({ id: 'cash-' + entry.id, date: entry.date, action: entry.kind === 'in' ? 'مبلغ داخل' : 'مبلغ خارج', reference: entry.category, detail: money(entry.amount) })),
    ...stockMovements.map(movement => ({ id: 'movement-' + movement.id, date: movement.date.slice(0, 10), action: 'حركة مخزون', reference: movement.reason, detail: movement.productName + ' · ' + movement.quantity })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 100)

  const quickSearchResults = useMemo(() => {
    const term = quickSearchQuery.trim().toLocaleLowerCase()
    if (!term) return [] as { type: Tab; id: string; title: string; subtitle: string }[]
    const results: { type: Tab; id: string; title: string; subtitle: string }[] = []
    for (const product of products) {
      if ((product.name + ' ' + product.code + ' ' + product.category).toLocaleLowerCase().includes(term)) {
        results.push({ type: 'products', id: product.id, title: product.name, subtitle: product.code + ' · ' + product.category })
      }
    }
    for (const invoice of invoices) {
      if ((invoice.number + ' ' + invoice.customer + ' ' + invoice.date + ' ' + (invoice.phone || '')).toLocaleLowerCase().includes(term)) {
        results.push({ type: 'invoices', id: invoice.id, title: invoice.number, subtitle: invoice.customer + ' · ' + invoice.date })
      }
    }
    for (const quote of quotes) {
      if ((quote.number + ' ' + quote.customer + ' ' + quote.date).toLocaleLowerCase().includes(term)) {
        results.push({ type: 'quotes', id: quote.id, title: quote.number, subtitle: quote.customer + ' · ' + quote.date })
      }
    }
    for (const entry of cashEntries) {
      if ((entry.category + ' ' + entry.note + ' ' + entry.date + ' ' + entry.amount).toLocaleLowerCase().includes(term)) {
        results.push({ type: 'cash', id: entry.id, title: entry.category, subtitle: entry.date + ' · ' + money(entry.amount) + (entry.note ? ' · ' + entry.note : '') })
      }
    }
    for (const movement of stockMovements) {
      const productCode = products.find(product => product.id === movement.productId)?.code || ''
      if ((movement.productName + ' ' + productCode + ' ' + movement.reason + ' ' + movement.reference + ' ' + movement.date).toLocaleLowerCase().includes(term)) {
        results.push({ type: 'products', id: movement.id, title: movement.productName, subtitle: 'حركة مخزون · ' + movement.reference + ' · ' + movement.date })
      }
    }
    for (const debt of supplierDebts) if ((debt.supplier + ' ' + debt.phone + ' ' + debt.reference).toLocaleLowerCase().includes(term)) results.push({ type: 'debts', id: debt.id, title: debt.supplier, subtitle: 'مورد · ' + debt.reference + ' · متبقي ' + money(debtRemaining(debt)) })
    for (const customer of customerSummaries) if ((customer.name + ' ' + customer.phone).toLocaleLowerCase().includes(term)) results.push({ type: 'customers', id: customer.name, title: customer.name, subtitle: customer.phone + ' · متبقي ' + money(customer.balance) })
    return results.slice(0, 30)
  }, [quickSearchQuery, products, invoices, quotes, cashEntries, stockMovements, supplierDebts, customerSummaries])

  useEffect(() => {
    const openQuickSearch = () => {
      setQuickSearchQuery('')
      setQuickSearchOpen(true)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'k' || event.code === 'KeyK')) {
        event.preventDefault()
        openQuickSearch()
      }
      if (event.key === 'Escape') setQuickSearchOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    // Packaged Windows builds route the shortcut through Electron's main process.
    const unsubscribe = window.alarabiDesktop?.onQuickSearchShortcut(openQuickSearch)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      unsubscribe?.()
    }
  }, [])

  const filteredInvoices = useMemo(() => {
    const term = archiveQuery.trim().toLocaleLowerCase()
    return invoices.filter(invoice => (!term || (invoice.number + ' ' + invoice.customer + ' ' + invoice.date + ' ' + (invoice.phone || '')).toLocaleLowerCase().includes(term)) && (invoiceStatusFilter === 'all' || (invoiceStatusFilter === 'returned' ? !!(invoice as Invoice & { returned?: boolean }).returned : !(invoice as Invoice & { returned?: boolean }).returned && invoice.status === invoiceStatusFilter)))
  }, [invoices, archiveQuery, invoiceStatusFilter])

  const filteredQuotes = useMemo(() => {
    const term = archiveQuery.trim().toLocaleLowerCase()
    return quotes.filter(quote => {
      const matchesTerm = !term || (quote.number + ' ' + quote.customer + ' ' + quote.date + ' ' + quote.items.map(item => item.name + ' ' + item.code).join(' ')).toLocaleLowerCase().includes(term)
      return matchesTerm && (!quoteFrom || quote.date >= quoteFrom) && (!quoteTo || quote.date <= quoteTo)
    })
  }, [quotes, archiveQuery, quoteFrom, quoteTo])

  const filteredCashEntries = useMemo(() => {
    const term = archiveQuery.trim().toLocaleLowerCase()
    if (!term) return cashEntries
    return cashEntries.filter(entry => (entry.category + ' ' + entry.note + ' ' + entry.date + ' ' + entry.amount).toLocaleLowerCase().includes(term))
  }, [cashEntries, archiveQuery])

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
            targetStock: String(p.targetStock ?? Math.max(p.minStock + 1, p.minStock * 3)),
            location: p.location || '',
          }
        : {
            code: '',
            name: '',
            category: '',
            quantity: '0',
            price: '0',
            costPrice: '0',
            minStock: '2',
            targetStock: '10',
            location: '',
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
      { label: 'المخزون المستهدف', value: draft.targetStock },
    ]
    for (const field of numericFields) {
      const value = Number(field.value)
      if (!field.value.trim() || !Number.isFinite(value) || value < 0) {
        setNotice(field.label + ' لازم يكون رقم صحيح أو صفر فأكثر')
        return
      }
    }
    if (Number(draft.targetStock) < Number(draft.minStock)) {
      setNotice('المخزون المستهدف لازم يكون مساويًا لحد التنبيه أو أكبر منه')
      return
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
      price: roundMoney(Number(draft.price)),
      costPrice: roundMoney(Number(draft.costPrice)),
      minStock: Number(draft.minStock),
      targetStock: Number(draft.targetStock),
      location: draft.location.trim(),
    }

    setProducts(old =>
      editingId
        ? old.map(p => (p.id === item.id ? item : p))
        : [item, ...old]
    )

    logActivity(editingId ? 'تعديل صنف' : 'إضافة صنف', item.code, item.name)
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

  const beginStocktake = () => {
    setStocktakeCounts(Object.fromEntries(products.map(product => [product.id, String(product.quantity)])))
    setStocktakeOpen(true)
  }

  const saveStocktake = () => {
    const changes = products.map(product => {
      const raw = stocktakeCounts[product.id]
      const count = Number(raw)
      return { product, count }
    })
    if (changes.some(({ count }) => !Number.isInteger(count) || count < 0)) {
      setNotice('أدخل كميات جرد صحيحة كأعداد صحيحة موجبة أو صفر')
      return
    }
    const changed = changes.filter(({ product, count }) => count !== product.quantity)
    if (!changed.length) { setStocktakeOpen(false); setNotice('الجرد مطابق للكميات المسجلة'); return }
    if (!window.confirm(`سيتم تسجيل ${changed.length} تسوية مخزون حسب الكميات الفعلية. هل راجعت الأرقام؟`)) return
    const timestamp = new Date().toISOString()
    setProducts(old => old.map(product => {
      const counted = changes.find(entry => entry.product.id === product.id)?.count
      return counted === undefined ? product : { ...product, quantity: counted }
    }))
    setStockMovements(old => [
      ...changed.map(({ product, count }) => ({ id: crypto.randomUUID(), productId: product.id, productName: product.name, kind: count >= product.quantity ? 'in' as const : 'out' as const, quantity: Math.abs(count - product.quantity), reason: 'تسوية جرد', reference: `جرد ${today()}`, date: timestamp, quantityBefore: product.quantity, quantityAfter: count })),
      ...old,
    ])
    logActivity('اعتماد جرد مخزون', today(), changed.length + ' تسوية')
    setStocktakeOpen(false)
    setNotice(`تم حفظ الجرد وتسجيل ${changed.length} تسوية في سجل الحركة`)
  }

  const saveStockMovement = () => {
    const product = products.find(item => item.id === movementProductId)
    if (!product) { setNotice('اختار الصنف'); return }
    const quantity = Number(movementQuantity)
    if (!Number.isFinite(quantity) || quantity <= 0) { setNotice('اكتب كمية أكبر من صفر'); return }
    if (movementKind === 'out' && quantity > product.quantity) {
      setNotice('الكمية المطلوبة أكبر من الكمية الحالية (' + product.quantity + ')')
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
    logActivity('تعديل رصيد مخزون', product.code, movementReason.trim() + ' · ' + quantity)
    setStockMovementModal(false)
    setNotice(movementKind === 'in' ? 'تم تسجيل دخول البضاعة وتحديث الكمية' : 'تم تسجيل خروج البضاعة وتحديث الكمية')
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

  const quoteTotal = itemsSubtotalFor(quoteRows)
  const invoiceSubtotal = quoteTotal
  const invoiceDiscountInput = Number(invoiceDiscount)
  const invoiceTaxInput = Number(invoiceTax)
  const invoiceDiscountValue = roundMoney(Math.max(0, Number(invoiceDiscount) || 0))
  const invoiceTaxValue = Math.max(0, Number(invoiceTax) || 0)
  const invoiceTotal = invoiceGrandTotalFor(invoiceSubtotal, invoiceDiscountValue, invoiceTaxValue)
  const invoiceBalance = roundMoney(Math.max(0, invoiceTotal - (Number(invoicePaid) || 0)))

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
    if (convertingQuoteId && invoices.some(invoice => invoice.quoteId === convertingQuoteId)) {
      setNotice('تم تحويل عرض السعر إلى فاتورة بالفعل. راجع قسم الفواتير.')
      return
    }
    if (!invoiceDiscount.trim() || !Number.isFinite(invoiceDiscountInput) || invoiceDiscountInput < 0) {
      setNotice('الخصم لازم يكون رقمًا صحيحًا ولا يقل عن صفر')
      return
    }
    if (invoiceDiscountValue > invoiceSubtotal) {
      setNotice('الخصم لا يمكن أن يكون أكبر من قيمة الأصناف')
      return
    }
    if (!invoiceTax.trim() || !Number.isFinite(invoiceTaxInput) || invoiceTaxInput < 0 || invoiceTaxInput > 100) {
      setNotice('نسبة الضريبة يجب أن تكون بين 0 و100')
      return
    }
    const paidInput = roundMoney(Number(invoicePaid))
    if (invoiceStatus !== 'paid' && (!invoicePaid.trim() || !Number.isFinite(paidInput) || paidInput < 0)) {
      setNotice('المبلغ المدفوع لازم يكون رقمًا صحيحًا ولا يقل عن صفر')
      return
    }
    if (invoiceStatus !== 'paid' && paidInput > invoiceTotal) {
      setNotice('المبلغ المدفوع لا يمكن أن يتجاوز إجمالي الفاتورة')
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
    if (lowMarginRows.length && !window.confirm(`تنبيه: سعر ${lowMarginRows.length} صنف أقل من تكلفة الشراء المحفوظة. هل تريد حفظ الفاتورة بهذه الأسعار؟`)) return

    const nextInvoiceNumber = invoices.reduce((max, item) => {
      const match = item.number.match(/^INV-(\d+)$/)
      return match ? Math.max(max, Number(match[1])) : max
    }, 0) + 1
    const total = invoiceTotal
    const paid = invoiceStatus === 'paid' ? total : roundMoney(Math.min(total, Math.max(0, Number(invoicePaid) || 0)))
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
      ...(convertingQuoteId ? { quoteId: convertingQuoteId } : {}),
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
    logActivity('إنشاء فاتورة', invoice.number, invoice.customer + ' · ' + money(total))
    if (convertingQuoteId) {
      const linkedQuoteId = convertingQuoteId
      setQuotes(old => old.map(quote => quote.id === linkedQuoteId ? { ...quote, convertedInvoiceId: invoice.id } : quote))
    }
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
    setConvertingQuoteId(null)
    setTab('invoices')
    setSavedDrafts(old => ({ ...old, invoice: undefined }))
    resetInvoiceDraft()
    setNotice('تم حفظ الفاتورة وخصم الكميات من المخزون بنجاح')
  }

  const returnInvoice = (invoice: Invoice) => {
    if ((invoice as Invoice & { returned?: boolean }).returned) { setNotice('الفاتورة مرتجعة بالكامل بالفعل'); return }
    const initial = Object.fromEntries(invoice.items.map(row => [row.productId, '0']))
    setReturnQuantities(initial)
    setReturnInvoiceDraft(invoice)
  }

  const savePartialReturn = () => {
    const invoice = returnInvoiceDraft
    if (!invoice) return
    const rows = invoice.items.map(item => ({ item, quantity: Number(returnQuantities[item.productId] || 0) }))
    const aggregated = new Map<string, number>()
    for (const { item, quantity } of rows) aggregated.set(item.productId, (aggregated.get(item.productId) || 0) + quantity)
    const prior = new Map<string, number>()
    for (const record of invoiceReturns(invoice.id)) for (const row of record.items || []) prior.set(row.productId, (prior.get(row.productId) || 0) + row.quantity)
    if (rows.some(({ quantity }) => !Number.isInteger(quantity) || quantity < 0) || [...aggregated].some(([id, quantity]) => quantity + (prior.get(id) || 0) > invoice.items.filter(row => row.productId === id).reduce((sum, row) => sum + row.quantity, 0))) {
      setNotice('كمية المرتجع تتجاوز الكمية المباعة والمتبقية في الفاتورة'); return
    }
    const selected = [...aggregated].filter(([, quantity]) => quantity > 0)
    if (!selected.length) { setNotice('حدد كمية واحدة على الأقل للإرجاع'); return }
    const subtotal = itemsSubtotalFor(invoice.items)
    const returnedSubtotal = roundMoney(rows.reduce((sum, { item, quantity }) => sum + item.price * quantity, 0))
    const allocatedDiscount = subtotal > 0 ? roundMoney(Math.min(invoice.discount, invoice.discount * returnedSubtotal / subtotal)) : 0
    const netReturnAmount = roundMoney(invoiceGrandTotalFor(returnedSubtotal, allocatedDiscount, invoice.tax))
    const priorRefunded = invoiceReturns(invoice.id).reduce((sum, record) => sum + (record.refundedAmount || 0), 0)
    const cashRefund = roundMoney(Math.min(netReturnAmount, Math.max(0, (invoice.paidAmount || 0) - priorRefunded)))
    if (!window.confirm(`تأكيد المرتجع الجزئي؟\nقيمة البضاعة والخصم والضريبة: ${money(netReturnAmount)}\nالمبلغ النقدي الذي سيرد للعميل: ${money(cashRefund)}\nرصيد الآجل سينخفض بقيمة الجزء المرتجع.`)) return
    const returnedLines = selected.map(([productId, quantity]) => ({ productId, productName: invoice.items.find(row => row.productId === productId)?.name || products.find(product => product.id === productId)?.name || 'صنف', quantity }))
    setProducts(old => old.map(product => ({ ...product, quantity: product.quantity + (aggregated.get(product.id) || 0) })))
    setStockMovements(old => [...returnedLines.map(row => { const product = products.find(item => item.id === row.productId); const before = product?.quantity; return { id: crypto.randomUUID(), productId: row.productId, productName: row.productName, kind: 'in' as const, quantity: row.quantity, reason: 'مرتجع جزئي', reference: invoice.number, date: today(), ...(before !== undefined ? { quantityBefore: before, quantityAfter: before + row.quantity } : {}) } }), ...old])
    setOperations(old => ({ ...old, returns: [{ id: crypto.randomUUID(), date: today(), invoiceId: invoice.id, invoiceNumber: invoice.number, customer: invoice.customer, amount: netReturnAmount, refundedAmount: cashRefund, items: returnedLines }, ...old.returns] }))
    if (cashRefund > 0) setCashEntries(old => [{ id: crypto.randomUUID(), kind: 'out', amount: cashRefund, category: 'رد قيمة مرتجع', note: `مرتجع جزئي ${invoice.number} — ${invoice.customer}`, date: today(), invoiceId: invoice.id }, ...old])
    const fullyReturned = invoice.items.every(item => (prior.get(item.productId) || 0) + (aggregated.get(item.productId) || 0) >= invoice.items.filter(row => row.productId === item.productId).reduce((sum, row) => sum + row.quantity, 0))
    const paidAfterRefund = roundMoney(Math.max(0, (invoice.paidAmount || 0) - priorRefunded - cashRefund))
    const netAfterReturn = roundMoney(Math.max(0, netInvoiceTotalFor(invoice) - netReturnAmount))
    const nextStatus = paidAfterRefund >= netAfterReturn ? 'paid' : paidAfterRefund > 0 ? 'partial' : 'unpaid'
    setInvoices(old => old.map(item => item.id === invoice.id ? { ...item, status: nextStatus, ...(fullyReturned ? { returned: true } : {}) } as Invoice : item))
    logActivity('مرتجع جزئي', invoice.number, invoice.customer + ' · ' + money(netReturnAmount))
    setReturnInvoiceDraft(null)
    setNotice(`تم تسجيل المرتجع وإضافة ${selected.reduce((sum, [, quantity]) => sum + quantity, 0)} وحدة إلى المخزون`)
  }

  const savePurchase = () => {
    const product = products.find(item => item.id === purchaseProductId)
    const quantity = Number(purchaseQuantity), unitCost = roundMoney(Number(purchaseCost)), paid = roundMoney(Number(purchasePaid || 0)), total = roundMoney(quantity * unitCost)
    if (!product || !purchaseSupplier.trim() || !Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost <= 0 || !Number.isFinite(paid) || paid < 0 || paid > total) { setNotice('راجع المورد والصنف والكمية والتكلفة والمبلغ المدفوع'); return }
    const before = product.quantity, after = before + quantity, averageCost = weightedAverageCostFor(before, product.costPrice || 0, quantity, unitCost)
    setProducts(old => old.map(item => item.id === product.id ? { ...item, quantity: after, costPrice: averageCost } : item))
    setStockMovements(old => [{ id: crypto.randomUUID(), productId: product.id, productName: product.name, kind: 'in', quantity, reason: 'استلام مشتريات', reference: purchaseSupplier.trim(), date: today(), quantityBefore: before, quantityAfter: after }, ...old])
    const purchaseId = crypto.randomUUID()
    setOperations(old => ({ ...old, purchases: [{ id: purchaseId, date: today(), supplier: purchaseSupplier.trim(), productId: product.id, productName: product.name, quantity, unitCost, paid, total }, ...old.purchases] }))
    logActivity('تسجيل مشتريات', purchaseSupplier.trim(), product.name + ' · ' + quantity)
    if (paid > 0) setCashEntries(old => [{ id: crypto.randomUUID(), kind: 'out', amount: paid, category: 'شراء بضاعة', note: `${product.name} — ${purchaseSupplier.trim()}`, date: today(), purchaseId }, ...old])
    const owing = roundMoney(total - paid)
    if (owing > 0) setSupplierDebts(old => [{ id: crypto.randomUUID(), supplier: purchaseSupplier.trim(), phone: '', reference: 'شراء ' + product.code, description: `${quantity} × ${product.name} بسعر تكلفة ${money(unitCost)}`, amount: owing, date: today(), dueDate: today(), payments: [] }, ...old])
    setPurchaseQuantity(''); setPurchaseCost(''); setPurchasePaid(''); setNotice('تم تسجيل الشراء وتحديث المخزون ومتوسط التكلفة والخزنة/الدين')
  }

  const saveCashCount = () => {
    const actual = roundMoney(Number(cashCountActual))
    if (!cashCountActual.trim() || !Number.isFinite(actual) || actual < 0) { setNotice('اكتب قيمة النقد الفعلية رقمًا صحيحًا'); return }
    const expected = cashBalance, difference = cashDifferenceFor(expected, actual)
    setOperations(old => ({ ...old, cashCounts: [{ id: crypto.randomUUID(), date: today(), expected, actual, difference }, ...old.cashCounts] }))
    setNotice(`تم حفظ جرد الخزنة. الفرق ${money(difference)}؛ راجعه وسجل أي حركة تصحيحية منفصلة.`); setCashCountActual('')
  }

  const deleteInvoice = (invoice: Invoice) => {
    if (invoiceReturns(invoice.id).length > 0) {
      setNotice('لا يمكن حذف فاتورة عليها مرتجعات مسجلة؛ احتفظ بالسجل المالي والمخزني كاملًا.')
      return
    }
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
    if (invoice.quoteId) setQuotes(old => old.map(quote => quote.id === invoice.quoteId ? { ...quote, convertedInvoiceId: undefined } : quote))
    setNotice('تم حذف الفاتورة وإرجاع كمياتها للمخزون')
  }

  const deleteQuote = (quote: Quote) => {
    if (invoices.some(invoice => invoice.id === quote.convertedInvoiceId || invoice.quoteId === quote.id)) {
      setNotice('لا يمكن حذف عرض سعر تم تحويله إلى فاتورة. احذف الفاتورة المرتبطة أولًا إذا كان ذلك ضروريًا.')
      return
    }
    if (!window.confirm(`متأكد إنك عايز تحذف عرض السعر ${quote.number}؟`)) return
    setQuotes(old => old.filter(item => item.id !== quote.id))
    setNotice('تم حذف عرض السعر')
  }

  const printDocument = (html: string, documentName: string) => {
    if (isDesktopApp() && window.alarabiDesktop?.printHtml) {
      void window.alarabiDesktop.printHtml(html)
        .then(() => setNotice('تم فتح معاينة ' + documentName + ' في المتصفح الخارجي'))
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
    printDocument(invoiceHtml(invoice, companySettings), 'الفاتورة')
  }

  const recordInvoicePayment = (invoice: Invoice) => {
    const balance = roundMoney(Math.max(0, netInvoiceTotalFor(invoice) - invoicePaidAfterReturns(invoice)))
    if (balance <= 0) { setNotice('الفاتورة مسددة بالكامل بالفعل'); return }
    setPaymentInvoice(invoice)
    setPaymentAmount(String(balance))
  }

  const confirmInvoicePayment = () => {
    if (!paymentInvoice) return
    const invoice = paymentInvoice
    const total = netInvoiceTotalFor(invoice)
    const balance = roundMoney(Math.max(0, total - invoicePaidAfterReturns(invoice)))
    const amount = roundMoney(Number(paymentAmount))
    if (!Number.isFinite(amount) || amount <= 0) { setNotice('اكتب مبلغ تحصيل صحيحًا أكبر من صفر'); return }
    if (amount > balance) { setNotice('مبلغ التحصيل أكبر من المتبقي على الفاتورة'); return }
    const payment = { id: crypto.randomUUID(), kind: 'in' as const, amount, category: 'تحصيل فاتورة', note: 'تحصيل ' + invoice.number + ' — ' + invoice.customer, date: today(), invoiceId: invoice.id }
    setCashEntries(old => [payment, ...old])
    setInvoices(old => old.map(item => {
      if (item.id !== invoice.id) return item
      const paidAmount = roundMoney(Math.min(invoiceTotalFor(item), Math.max(0, item.paidAmount || 0) + amount))
      const netPaid = roundMoney(invoicePaidAfterReturns(invoice) + amount)
      return { ...item, paidAmount, status: netPaid >= total ? 'paid' : netPaid > 0 ? 'partial' : 'unpaid' }
    }))
    setPaymentInvoice(null)
    setPaymentAmount('')
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
      phone: quotePhone.trim(),
      followUpDate: quoteFollowUpDate || undefined,
      validUntil: addDaysToDate(today(), 7),
      status: 'new',
    }

    setQuotes(old => [quote, ...old])
    logActivity('إنشاء عرض سعر', quote.number, quote.customer + ' · ' + money(itemsSubtotalFor(quote.items)))
    setQuoteModal(false)
    setSavedDrafts(old => ({ ...old, quote: undefined }))
    setTab('quotes')
    setCustomer('')
    setQuotePhone('')
    setQuoteFollowUpDate('')
    setQuoteRows([])
    setNotice('تم حفظ عرض السعر')
  }

  const printQuote = (q: Quote) => {
    printDocument(quoteHtml(q, companySettings), 'عرض السعر')
  }

  const updateQuote = (quote: Quote, patch: Partial<Quote>) => {
    setQuotes(old => old.map(item => item.id === quote.id ? { ...item, ...patch } : item))
    logActivity('تحديث عرض سعر', quote.number, patch.status ? 'الحالة: ' + patch.status : 'موعد متابعة: ' + (patch.followUpDate || 'تم الإلغاء'))
  }

  const duplicateQuote = (quote: Quote) => {
    setCustomer(quote.customer)
    setQuotePhone(quote.phone || '')
    setQuoteFollowUpDate('')
    setQuoteRows(quote.items.map(item => ({ ...item })))
    setQuoteModal(true)
  }

  const convertQuoteToInvoice = (quote: Quote) => {
    const existingInvoice = invoices.find(invoice => invoice.id === quote.convertedInvoiceId || invoice.quoteId === quote.id)
    if (existingInvoice) {
      setTab('invoices')
      setNotice(`عرض السعر محول بالفعل إلى الفاتورة ${existingInvoice.number}`)
      return
    }
    setConvertingQuoteId(quote.id)
    setInvoiceCustomer(quote.customer)
    setInvoicePhone(quote.phone || '')
    setInvoiceDueDate('')
    setInvoiceDiscount('0')
    setInvoiceTax('0')
    setInvoiceStatus('unpaid')
    setInvoicePaid('0')
    setInvoiceNotes(`تحويل من عرض السعر ${quote.number}`)
    setQuoteRows(quote.items.map(item => ({ ...item })))
    setInvoiceModal(true)
  }

  const closeInvoiceModal = () => {
    setInvoiceModal(false)
    setConvertingQuoteId(null)
    resetInvoiceDraft()
  }

  const importProductsExcel = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return
    try {
      const { default: ExcelJS } = await import('exceljs'); const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await file.arrayBuffer())
      const sheet = workbook.worksheets[0]; if (!sheet || sheet.rowCount < 2) throw new Error('الملف فارغ أو لا يحتوي أصنافًا')
      const labels = new Map<string, number>(); sheet.getRow(1).eachCell((cell, column) => labels.set(String(cell.text || '').trim().toLowerCase(), column))
      const col = (...names: string[]) => names.map(name => labels.get(name)).find(value => value !== undefined)
      const codeCol = col('كود الصنف','الكود','code'), nameCol = col('اسم الصنف','الصنف','name')
      if (!codeCol || !nameCol) throw new Error('يجب إضافة عمودي «كود الصنف» و«اسم الصنف» في الصف الأول')
      const priceCol=col('سعر البيع','السعر','price'), costCol=col('تكلفة الوحدة','سعر التكلفة','التكلفة','cost'), qtyCol=col('الكمية','quantity'), minCol=col('حد التنبيه','الحد الأدنى','minstock'), catCol=col('الفئة','category')
      const imported: Product[]=[]
      sheet.eachRow((row, index) => { if(index===1)return; const code=String(row.getCell(codeCol).text||'').trim(), name=String(row.getCell(nameCol).text||'').trim(); if(!code&&!name)return; const num=(c:number|undefined,d:number)=>c?Number(row.getCell(c).value||d):d; const quantity=num(qtyCol,0),price=num(priceCol,0),costPrice=num(costCol,0),minStock=num(minCol,0); if(!code||!name||![quantity,price,costPrice,minStock].every(Number.isFinite)||quantity<0||price<0||costPrice<0||minStock<0)throw new Error(`بيانات غير صحيحة في الصف ${index}`); imported.push({id:crypto.randomUUID(),code,name,category:catCol?String(row.getCell(catCol).text||'عام'):'عام',quantity,price:roundMoney(price),costPrice:roundMoney(costPrice),minStock}) })
      const existing=new Set(products.map(p=>p.code.trim().toLowerCase())); const duplicates=imported.filter(p=>existing.has(p.code.trim().toLowerCase()))
      const seen=new Set<string>(); const duplicateCodes=imported.filter(p=>{const key=p.code.trim().toLowerCase();if(seen.has(key))return true;seen.add(key);return false}).map(p=>p.code)
      if(duplicates.length||duplicateCodes.length)throw new Error('أكواد مكررة أو موجودة بالفعل: '+[...new Set([...duplicates.map(p=>p.code),...duplicateCodes])].slice(0,5).join('، '))
      if(!imported.length)throw new Error('لم يتم العثور على أصناف صالحة')
      setProducts(old=>[...imported,...old]); setNotice(`تم استيراد ${imported.length} صنف من Excel`)
    } catch(error) { setNotice('تعذر استيراد الأصناف: '+(error instanceof Error?error.message:'خطأ في الملف')) } finally { event.target.value='' }
  }

  const printCustomerStatement = (customerName: string) => {
    const docs=invoices.filter(invoice=>invoice.customer.trim().toLowerCase()===customerName.trim().toLowerCase())
    const esc=(v:unknown)=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    const rows=docs.map(invoice=>{const returned=!!(invoice as Invoice & {returned?:boolean}).returned; const total=netInvoiceTotalFor(invoice), paid=invoicePaidAfterReturns(invoice); return `<tr><td>${esc(invoice.date)}</td><td>${esc(invoice.number)}</td><td>${returned?'مرتجعة':money(total)}</td><td>${returned?'مرتجعة':money(paid)}</td><td>${returned?money(0):money(Math.max(0,total-paid))}</td></tr>`}).join('')
    const html=`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>كشف حساب عميل</title><style>body{font:14px Tahoma;padding:24px;color:#243746}table{border-collapse:collapse;width:100%;margin-top:20px}td,th{border:1px solid #ccd5dc;padding:10px;text-align:right}th{background:#173653;color:white}</style><h1>${esc(companySettings.name)} — كشف حساب عميل</h1><p>العميل: ${esc(customerName)} · ${esc(companySettings.address)}</p><table><thead><tr><th>التاريخ</th><th>رقم الفاتورة</th><th>الإجمالي</th><th>المحصل</th><th>المتبقي</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=()=>window.print()</script></html>`
    printDocument(html, 'كشف حساب العميل')
  }

  const shareDocumentOnWhatsApp = (kind: 'فاتورة بيع' | 'عرض سعر', number: string, customerName: string, date: string, total: number, balance?: number) => {
    const text = [`${companySettings.name}`, kind, `رقم المستند: ${number}`, `العميل: ${customerName}`, `التاريخ: ${date}`, `الإجمالي: ${money(total)}`, ...(balance === undefined ? [] : [`المتبقي: ${money(balance)}`]), 'يمكن طباعة المستند أو حفظه PDF من البرنامج.'].join('\n')
    const url = 'https://wa.me/?text=' + encodeURIComponent(text)
    if (isDesktopApp() && window.alarabiDesktop?.openWhatsApp) {
      void window.alarabiDesktop.openWhatsApp(url).catch(error => setNotice('تعذر فتح واتساب: ' + String(error)))
      return
    }
    const opened = window.open(url, '_blank', 'noopener,noreferrer')
    if (!opened) setNotice('اسمح بالنوافذ المنبثقة لفتح واتساب')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark">
          <Boxes size={24} aria-hidden="true" />
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
          <button className={tab === 'debts' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('debts')}><CircleDollarSign size={19} /> ديون الموردين {overdueSupplierDebts.length > 0 && <span className="nav-count">{overdueSupplierDebts.length}</span>}</button>

          <button
            className={tab === 'invoices' ? 'nav-item active' : 'nav-item'} data-tutorial-target="invoices"
            onClick={() => setTab('invoices')}
          >
            <Receipt size={19} /> الفواتير
            <span className="nav-count">{invoices.length}</span>
          </button>
        </nav>

        <button className={tab === 'reports' ? 'nav-item active' : 'nav-item'} data-tutorial-target="reports" onClick={() => setTab('reports')}><Download size={19} /> التقارير والتصدير</button>
        <button className={tab === 'customers' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('customers')}><Users size={19} /> العملاء وكشوف الحساب</button>
        <button className={tab === 'activity' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('activity')}><History size={19} /> سجل النشاط</button>
        <button className={tab === 'settings' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('settings')}><Settings size={19} /> إعدادات الشركة</button>
        <button className="nav-item" onClick={() => { setTutorialStep(0); setTab('dashboard') }}><ClipboardList size={19} /> شرح البرنامج</button>
        <button data-tutorial-target="account" className="nav-item" onClick={() => {
          if (isDesktopApp()) {
            const result = window.alarabiDesktop!.writeStateBundleSync(desktopStateRef.current)
            if (!result.ok) { setLocalSaveStatus('error'); setCloudError('تعذر حفظ آخر التغييرات قبل تسجيل الخروج: ' + (result.error || 'خطأ غير متوقع')); return }
            void window.alarabiDesktop!.localLogout().then(() => window.location.reload())
          } else void supabase.auth.signOut()
        }}>تسجيل الخروج</button>
        <div className="sidebar-foot">
          <span className="status-dot" /> إدارة المخزون
          <small>v1.1.9</small>
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
        {!cloudLoaded && !cloudError && <BrandedLoadingScreen caption={isDesktopApp() ? 'جارٍ تحميل بيانات المحل' : 'جارٍ تحميل بياناتك من السحابة'} />}
        {cloudError && <button className="notice" onClick={() => setCloudError('')}><AlertTriangle size={16} aria-hidden="true" /> {cloudError} <X size={15} aria-hidden="true" /></button>}
        <header className="topbar">
          <div>
            <div className="eyebrow">{companySettings.name}</div>

            <h1>
              {tab === 'dashboard'
                ? 'لوحة التحكم'
                : tab === 'products'
                  ? 'الأصناف والمخزون'
                  : tab === 'quotes' ? 'عروض الأسعار' : tab === 'cash' ? 'الخزنة والحركة المالية' : tab === 'debts' ? 'ديون الموردين' : tab === 'reports' ? 'التقارير والتصدير' : tab === 'customers' ? 'العملاء وكشوف الحساب' : tab === 'activity' ? 'سجل النشاط' : tab === 'settings' ? 'إعدادات الشركة' : 'الفواتير'}
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="primary-button" onClick={exportEndOfDay} disabled={!cloudLoaded} title={'حفظ حركة اليوم ولقطة المخزون بتاريخ ' + today()} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <CalendarCheck size={16} /> إنهاء اليوم
            </button>
            <button type="button" className="secondary-button" onClick={() => { setQuickSearchQuery(''); setQuickSearchOpen(true) }} aria-label="بحث سريع" title="بحث سريع (Ctrl+K)" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Search size={16} /> بحث سريع <kbd style={{ fontSize: 11, padding: '2px 6px', border: '1px solid #d5dde5', borderRadius: 5, background: '#fff' }}>Ctrl K</kbd>
            </button>
            {savedDrafts.invoice && <button type="button" className="secondary-button" onClick={() => restoreSavedDraft('invoice')}>استعادة مسودة الفاتورة</button>}
            {savedDrafts.quote && <button type="button" className="secondary-button" onClick={() => restoreSavedDraft('quote')}>استعادة مسودة العرض</button>}
            <div className="today-chip">
              {new Date().toLocaleDateString('ar-EG', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </div>
            {isDesktopApp() && cloudLoaded && <div className={'save-indicator ' + localSaveStatus} role="status" aria-live="polite">
              {localSaveStatus === 'saved' ? <Check size={14} aria-hidden="true" /> : localSaveStatus === 'error' ? <AlertTriangle size={14} aria-hidden="true" /> : <span className="saving-spinner" aria-hidden="true" />}
              {localSaveStatus === 'saved' ? 'تم الحفظ محليًا' : localSaveStatus === 'error' ? 'تعذر الحفظ' : 'جارٍ حفظ التغييرات'}
            </div>}
          </div>
        </header>

        {quickSearchOpen && (
          <div role="dialog" aria-modal="true" aria-label="البحث السريع في البرنامج" onClick={event => { if (event.target === event.currentTarget) setQuickSearchOpen(false) }} style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(8,20,32,.62)', padding: 18, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', direction: 'rtl' }}>
            <section style={{ width: 'min(100%, 720px)', marginTop: 'min(10vh, 90px)', maxHeight: '78vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#fff', color: '#173653', border: '1px solid #dce4eb', borderRadius: 16, boxShadow: '0 24px 80px rgba(0,0,0,.3)' }}>
              <div style={{ padding: 16, borderBottom: '1px solid #e5ebf0', display: 'flex', gap: 10, alignItems: 'center' }}>
                <Search size={20} />
                <input autoFocus value={quickSearchQuery} onChange={event => setQuickSearchQuery(event.target.value)} placeholder="ابحث عن صنف أو كود أو فاتورة أو عميل أو عرض سعر أو حركة..." style={{ flex: 1, minWidth: 0, border: 0, outline: 0, font: 'inherit', padding: 8, color: '#173653' }} />
                <button type="button" className="icon-btn" aria-label="إغلاق البحث" onClick={() => setQuickSearchOpen(false)}><X size={18} /></button>
              </div>
              <div style={{ padding: '8px 16px', color: '#718397', fontSize: 12 }}>اكتب للبحث في السجلات الحالية. اضغط على نتيجة للانتقال للقسم المناسب.</div>
              <div style={{ overflowY: 'auto', padding: 8 }}>
                {!quickSearchQuery.trim() ? (
                  <div style={{ padding: 24, textAlign: 'center', color: '#718397' }}>ابدأ بكتابة اسم أو كود أو رقم مستند.</div>
                ) : quickSearchResults.length ? quickSearchResults.map(result => (
                  <button key={result.type + ':' + result.id} type="button" onClick={() => {
                    setTab(result.type)
                    setArchiveQuery(quickSearchQuery)
                    if (result.type === 'products') setQuery(quickSearchQuery)
                    if (result.type === 'customers') setCustomerSearch(quickSearchQuery)
                    if (result.type === 'debts') setDebtSearch(quickSearchQuery)
                    setQuickSearchOpen(false)
                  }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 10px', border: 0, borderRadius: 9, background: 'transparent', textAlign: 'right', cursor: 'pointer', color: '#173653' }}>
                    <span style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 10, display: 'grid', placeItems: 'center', background: '#edf3f7' }}>
                      {result.type === 'products' ? <Package size={18} /> : result.type === 'invoices' ? <Receipt size={18} /> : result.type === 'quotes' ? <FileText size={18} /> : result.type === 'customers' ? <Users size={18} /> : result.type === 'debts' ? <CircleDollarSign size={18} /> : <Wallet size={18} />}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ display: 'block' }}>{result.title}</strong>
                      <span style={{ display: 'block', color: '#718397', fontSize: 12, marginTop: 3, overflowWrap: 'anywhere' }}>{result.subtitle}</span>
                    </span>
                    <span style={{ color: '#718397', fontSize: 11, whiteSpace: 'nowrap' }}>{result.type === 'products' ? 'الأصناف / حركة مخزون' : result.type === 'invoices' ? 'فاتورة' : result.type === 'quotes' ? 'عرض سعر' : result.type === 'customers' ? 'عميل' : result.type === 'debts' ? 'مورد' : 'الخزنة'}</span>
                  </button>
                )) : <div style={{ padding: 24, textAlign: 'center', color: '#718397' }}>مفيش نتائج مطابقة للبحث ده.</div>}
              </div>
              <div style={{ padding: 12, borderTop: '1px solid #e5ebf0', color: '#718397', fontSize: 11 }}>للإغلاق اضغط Esc · لفتح البحث في أي وقت استخدم Ctrl + K</div>
            </section>
          </div>
        )}

        {notice && !productModal && !invoiceModal && (
          <button className="notice-toast" role="status" onClick={() => setNotice('')}>
            <Check size={16} />
            {notice}
            <X size={15} />
          </button>
        )}

        {tab === 'dashboard' && (
          <>
            <section className="welcome">
              <div>
                <span className="welcome-label">إدارة المبيعات والمخزون</span>
                <h2>أنظمة التأريض والحماية من الصواعق.</h2>
                <p>
                  تابع الأصناف والكميات، وراجع المخزون وجهّز عروض الأسعار
                  لعملائك بسهولة.
                </p>
              </div>

              <div className="welcome-art">
                <Boxes size={64} aria-hidden="true" />
              </div>
            </section>

            <section className="stats-grid financial-stats">
              <Stat icon={<Receipt />} label="إجمالي الفواتير" value={money(totalInvoiceSales)} foot={invoices.length + ' فاتورة مسجلة'} />
              <Stat icon={<CircleDollarSign />} label="المبالغ المحصلة" value={money(totalCollected)} foot={paidInvoiceCount + ' فاتورة مسددة بالكامل'} />
              <Stat icon={<AlertTriangle />} label="مستحقات العملاء" value={money(customerBalances)} foot={unpaidInvoices.length + ' فاتورة عليها رصيد'} warning={customerBalances > 0} />
              <Stat icon={<Wallet />} label="رصيد الخزنة المسجل" value={money(cashBalance)} foot="من حركات الخزنة اليدوية فقط" />
              <Stat icon={<TrendingUp />} label="تكلفة البضاعة المباعة المسجلة" value={money(knownCostSales)} foot={hasMissingCosts ? `بيانات مكتملة لـ ${costCompleteInvoices.length} من ${invoices.length} فاتورة` : 'حسب تكلفة الشراء المحفوظة بالفواتير'} warning={hasMissingCosts} />
              <Stat icon={<CircleDollarSign />} label="صافي تقديري بعد المصروفات" value={money(knownNetProfit)} foot={(hasMissingCosts ? 'فقط للفواتير ذات التكلفة المسجلة؛ ' : '') + 'هامش تقديري ' + estimatedProfitMargin + '% قبل الضريبة'} warning={hasMissingCosts} />
            </section>

            <section className="dashboard-insights">
              <div className="panel"><div className="panel-head"><div><h3>المبيعات خلال آخر 7 أيام</h3><p>إجمالي قيمة الفواتير النشطة حسب تاريخها</p></div></div><div className="sales-bars">{recentSales.map(day=><div className="sales-bar-item" key={day.date} title={`${day.date}: ${money(day.total)}`}><strong>{day.total ? money(day.total) : '—'}</strong><div className="sales-bar-track"><span style={{height:`${Math.max(day.total ? 8 : 2, day.total/maxDailySales*100)}%`}}/></div><small>{day.label}</small></div>)}</div></div>
              <div className="panel"><div className="panel-head"><div><h3>الأكثر مبيعًا</h3><p>بالكمية المسجلة في الفواتير</p></div></div>{topProducts.length?<ol className="top-products">{topProducts.map((item,index)=><li key={item.name+index}><span>{item.name}</span><b>{item.quantity} وحدة</b></li>)}</ol>:<p className="muted">ستظهر الأصناف بعد تسجيل فواتير البيع.</p>}</div>
            </section>

            <section className="panel dashboard-goal-panel">
              <div className="panel-head"><div><h3>هدف المبيعات الشهري</h3><p>مقارنة أداء الشهر الحالي بالشهر السابق.</p></div><b>{monthlyGoalProgress.toFixed(0)}%</b></div>
              <div className="goal-track"><span style={{ width: `${monthlyGoalProgress}%` }} /></div>
              <div className="goal-meta"><span>الشهر الحالي: {money(thisMonthSales)}{monthlySalesTarget ? ` من ${money(monthlySalesTarget)}` : ''}</span><span>مقارنة بالشهر السابق: {monthOverMonthChange === null ? 'لا توجد بيانات سابقة' : `${monthOverMonthChange > 0 ? '+' : ''}${monthOverMonthChange}%`}</span></div>
              {monthlySalesTarget > 0 && thisMonthSales >= monthlySalesTarget && <p className="goal-success">تم الوصول لهدف المبيعات لهذا الشهر.</p>}
            </section>

            <section className="panel"><div className="panel-head products-head"><div><h3>توقع نفاد المخزون وقائمة الشراء</h3><p>تقدير من المبيعات خلال آخر 30 يومًا؛ راجع الكميات قبل الشراء.</p></div><button className="secondary-btn" onClick={printReorderList}><Printer size={15}/> طباعة قائمة الشراء</button></div>{reorderSuggestions.length ? <div className="table-wrap"><table><thead><tr><th>الصنف</th><th>المتاح</th><th>متوسط البيع اليومي</th><th>النفاد المتوقع</th><th>كمية الشراء المقترحة</th></tr></thead><tbody>{reorderSuggestions.slice(0,12).map(item=><tr key={item.product.id}><td>{item.product.name}</td><td>{item.product.quantity}</td><td>{item.dailyRate.toFixed(2)}</td><td>{item.daysLeft === null ? 'لا توجد مبيعات حديثة' : item.daysLeft + ' يوم'}</td><td><b>{item.buyQuantity}</b></td></tr>)}</tbody></table></div> : <p className="muted">لا توجد أصناف منخفضة أو متوقع نفادها خلال أسبوعين.</p>}</section>

            <section className="panel">
              <div className="panel-head"><div><h3>مركز التنبيهات</h3><p>الحاجات اللي محتاجة مراجعتك دلوقتي</p></div></div>
              <div className="alert-list">
                {lowStock.length > 0 && <button className="alert-row" onClick={() => setTab('products')}><AlertTriangle size={17}/> {lowStock.length} صنف وصل لحد التنبيه أو أقل</button>}
                {dueCustomerInvoices.length > 0 && <button className="alert-row" onClick={() => setTab('invoices')}><AlertTriangle size={17}/> {dueCustomerInvoices.length} فاتورة عميل متأخرة عن الاستحقاق</button>}
                {upcomingDueInvoices.length > 0 && <button className="alert-row" onClick={() => setTab('invoices')}><CalendarCheck size={17}/> {upcomingDueInvoices.length} فاتورة تستحق خلال 7 أيام</button>}
                {overdueSupplierDebts.length > 0 && <button className="alert-row" onClick={() => setTab('debts')}><AlertTriangle size={17}/> {overdueSupplierDebts.length} دين مورد متأخر</button>}
                {activeOverdueQuotes.length > 0 && <button className="alert-row" onClick={() => setTab('quotes')}><CalendarCheck size={17}/> {activeOverdueQuotes.length} عرض سعر قديم لم يتحول لفاتورة</button>}
                {expiredQuotes.length > 0 && <button className="alert-row" onClick={() => setTab('quotes')}><AlertTriangle size={17}/> {expiredQuotes.length} عرض سعر انتهت صلاحيته</button>}
                {!lowStock.length && !dueCustomerInvoices.length && !upcomingDueInvoices.length && !overdueSupplierDebts.length && !activeOverdueQuotes.length && !expiredQuotes.length && <p className="muted">لا توجد تنبيهات معلقة حاليًا.</p>}
              </div>
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
                  <p>{isDesktopApp() ? 'ينشئ البرنامج تلقائيًا نسخة محلية كل 30 دقيقة ويحتفظ بآخر 24 نسخة. نزّل أيضًا نسخة JSON قبل نقل الجهاز، أو استرجع ملفًا سابقًا.' : 'نزّل نسخة JSON بعد العمل واحفظها بمكان آمن. النسخ التلقائي كل 30 دقيقة متاح في إصدار Windows المكتبي.'}</p>
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
                        <th>كمية الشراء المقترحة</th>
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
                          <td><b>{Math.max(0, (p.targetStock ?? Math.max(p.minStock + 1, p.minStock * 3)) - p.quantity)}</b></td>
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
                            (s, x) => s + lineTotalFor(x),
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
            <div className="cash-reconcile"><strong>جرد نقدية الصندوق</strong><span>الرصيد الدفتري: {money(cashBalance)}</span><label className="field"><span>النقد الفعلي</span><input type="number" min="0" step="0.01" value={cashCountActual} onChange={e=>setCashCountActual(e.target.value)} placeholder="المبلغ الموجود بالصندوق"/></label><button className="secondary-btn" onClick={saveCashCount}>حفظ نتيجة الجرد</button></div>
            {operations.cashCounts.length>0&&<p className="muted">آخر جرد {operations.cashCounts[0].date}: الفعلي {money(operations.cashCounts[0].actual)} · الفرق {money(operations.cashCounts[0].difference)}</p>}
            <div className="toolbar"><label className="searchbox"><Search size={18} /><input value={archiveQuery} onChange={e => setArchiveQuery(e.target.value)} placeholder="ابحث بالبند أو الملاحظات أو التاريخ أو المبلغ..." /></label><span className="muted">{filteredCashEntries.length} حركة</span><button className="secondary-btn" onClick={() => setArchiveQuery('')}>مسح البحث</button></div>
            {filteredCashEntries.length ? <div className="table-wrap"><table><thead><tr><th>التاريخ</th><th>النوع</th><th>البند</th><th>ملاحظات</th><th>المبلغ</th><th>إجراء</th></tr></thead><tbody>{filteredCashEntries.map(entry => <tr key={entry.id}><td>{entry.date}</td><td><span className={entry.kind === 'in' ? 'pill success' : 'pill danger'}>{entry.kind === 'in' ? 'مبلغ داخل' : 'مبلغ خارج'}</span></td><td className="product-cell">{entry.category}</td><td>{entry.note || '—'}</td><td><strong>{entry.kind === 'in' ? '+' : '−'} {money(entry.amount)}</strong></td><td>{entry.invoiceId ? <span className="muted">مرتبطة بفاتورة</span> : entry.supplierDebtPaymentId ? <span className="muted">مرتبطة بسداد دين</span> : entry.purchaseId ? <span className="muted">مرتبطة بعملية شراء</span> : <button className="icon-btn delete" title="حذف الحركة" aria-label="حذف الحركة" onClick={() => deleteCashEntry(entry)}><Trash2 size={16} /></button>}</td></tr>)}</tbody></table></div> : <Empty title="لسه مفيش حركات مالية" detail="سجّل أول مبلغ داخل أو خارج لمتابعة الخزنة." />}
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
                <button className="secondary-button" onClick={printProductLabels}><Printer size={16}/> ملصقات الأسعار</button>
                <label className="secondary-button" style={{display:'inline-flex',alignItems:'center',gap:7,cursor:'pointer'}}><Upload size={16}/> استيراد Excel<input type="file" accept=".xlsx" hidden onChange={importProductsExcel}/></label>
                <button className="secondary-button" onClick={recordStockMovement}>
                  <Boxes size={17} /> تسجيل حركة مخزون
                </button>
                <button className="secondary-button" onClick={beginStocktake}><ClipboardList size={17} /> جرد المخزون</button>
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

            <section className="panel bulk-pricing-panel">
              <div className="panel-head"><div><h3>تعديل أسعار مجموعة</h3><p>راجع المعاينة قبل اعتماد السعر الجديد، مع حفظ أسعار الفواتير القديمة كما هي.</p></div></div>
              <div className="form-grid"><label className="field"><span>الفئة</span><select value={bulkPriceCategory} onChange={e=>setBulkPriceCategory(e.target.value)}><option value="all">كل الفئات</option>{Array.from(new Set(products.map(p=>p.category).filter(Boolean))).map(category=><option key={category} value={category}>{category}</option>)}</select></label><Field label="نسبة التغيير % (السالب للتخفيض)" type="number" value={bulkPricePercent} onChange={setBulkPricePercent} placeholder="مثال: 10 أو -5"/><div style={{display:'flex',alignItems:'end'}}><button className="secondary-btn" onClick={buildBulkPricePreview}>معاينة الأسعار</button></div></div>
              {bulkPricePreview && <><div className="table-wrap"><table><thead><tr><th>الصنف</th><th>السعر الحالي</th><th>السعر المقترح</th></tr></thead><tbody>{bulkPricePreview.slice(0,20).map(row=><tr key={row.product.id}><td>{row.product.name}</td><td>{money(row.before)}</td><td><b>{money(row.after)}</b></td></tr>)}</tbody></table></div>{bulkPricePreview.length>20&&<p className="muted">تظهر أول 20 نتيجة من {bulkPricePreview.length} صنفًا.</p>}<button className="primary-btn" onClick={applyBulkPricePreview}>اعتماد الأسعار المعروضة</button></>}
            </section>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <h3>تقرير حركة المخزون</h3>
                  <p>ابحث بكود الصنف أو اسمه، وحدد نوع الحركة والفترة الزمنية لمراجعة السجل.</p>
                </div>
                <span className="muted">{stockMovements.filter(m => (!selectedMovementProductId || m.productId === selectedMovementProductId) && (!query.trim() || (m.productName + ' ' + (products.find(p => p.id === m.productId)?.code || '')).toLowerCase().includes(query.trim().toLowerCase())) && (movementKindFilter === 'all' || m.kind === movementKindFilter) && (!movementFromDate || m.date >= movementFromDate) && (!movementToDate || m.date <= movementToDate)).length} حركة</span>
              </div>
              <div className="form-grid" style={{ marginBottom: 16 }}>
                <label className="field"><span>الصنف</span><select value={selectedMovementProductId} onChange={e=>setSelectedMovementProductId(e.target.value)}><option value="">كل الأصناف</option>{products.map(product=><option key={product.id} value={product.id}>{product.code} — {product.name}</option>)}</select></label>
                <label className="field"><span>نوع الحركة</span>
                  <select value={movementKindFilter} onChange={e => setMovementKindFilter(e.target.value as 'all' | 'in' | 'out')}>
                    <option value="all">كل الحركات</option><option value="in">دخول فقط</option><option value="out">خروج فقط</option>
                  </select>
                </label>
                <label className="field"><span>من تاريخ</span><input type="date" value={movementFromDate} onChange={e => setMovementFromDate(e.target.value)} /></label>
                <label className="field"><span>إلى تاريخ</span><input type="date" value={movementToDate} onChange={e => setMovementToDate(e.target.value)} /></label>
                <div style={{ display: 'flex', alignItems: 'end' }}><button className="secondary-btn" onClick={() => { setSelectedMovementProductId(''); setMovementKindFilter('all'); setMovementFromDate(''); setMovementToDate('') }}>مسح الفلاتر</button></div>
              </div>
              {stockMovements.filter(m => (!selectedMovementProductId || m.productId === selectedMovementProductId) && (!query.trim() || (m.productName + ' ' + (products.find(p => p.id === m.productId)?.code || '')).toLowerCase().includes(query.trim().toLowerCase())) && (movementKindFilter === 'all' || m.kind === movementKindFilter) && (!movementFromDate || m.date >= movementFromDate) && (!movementToDate || m.date <= movementToDate)).length ? (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>التاريخ</th><th>كود الصنف</th><th>الصنف</th><th>الحركة</th><th>الكمية</th><th>الكمية قبل</th><th>الكمية بعد</th><th>السبب</th><th>المرجع</th></tr></thead>
                    <tbody>
                      {stockMovements.filter(m => (!selectedMovementProductId || m.productId === selectedMovementProductId) && (!query.trim() || (m.productName + ' ' + (products.find(p => p.id === m.productId)?.code || '')).toLowerCase().includes(query.trim().toLowerCase())) && (movementKindFilter === 'all' || m.kind === movementKindFilter) && (!movementFromDate || m.date >= movementFromDate) && (!movementToDate || m.date <= movementToDate)).map(movement => (
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
                      <th>الموقع</th>
                      <th>الكمية</th>
                      <th>سعر الوحدة</th>
                      <th>هامش الوحدة</th>
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
                        <td>{p.location || '—'}</td>
                        <td>{p.quantity}</td>
                        <td>{money(p.price)}</td>
                        <td className={(p.price - (p.costPrice ?? 0)) < 0 ? 'text-danger' : ''}>{typeof p.costPrice === 'number' ? money(p.price - p.costPrice) : 'غير محدد'}</td>
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


        {tab === 'debts' && (
          <>
            <section className="panel"><div className="panel-head"><div><h3>استلام مشتريات</h3><p>يسجل البضاعة الواردة، ويحدّث متوسط تكلفة الصنف والخزنة أو دين المورد.</p></div></div>
              <div className="form-grid"><label className="field"><span>المورد *</span><input value={purchaseSupplier} onChange={e=>setPurchaseSupplier(e.target.value)} placeholder="اسم المورد"/></label><label className="field"><span>الصنف *</span><select value={purchaseProductId} onChange={e=>setPurchaseProductId(e.target.value)}><option value="">اختر الصنف</option>{products.map(p=><option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select></label><label className="field"><span>الكمية *</span><input type="number" min="1" step="1" value={purchaseQuantity} onChange={e=>setPurchaseQuantity(e.target.value)}/></label><label className="field"><span>تكلفة الوحدة *</span><input type="number" min="0.01" step="0.01" value={purchaseCost} onChange={e=>setPurchaseCost(e.target.value)}/></label><label className="field"><span>المدفوع الآن</span><input type="number" min="0" step="0.01" value={purchasePaid} onChange={e=>setPurchasePaid(e.target.value)}/></label></div>
              {Number(purchaseQuantity)>0&&Number(purchaseCost)>0&&<p className="muted">إجمالي الشراء: {money(Number(purchaseQuantity)*Number(purchaseCost))} · الدين المتبقي: {money(Math.max(0,Number(purchaseQuantity)*Number(purchaseCost)-Number(purchasePaid||0)))}</p>}
              <div style={{display:'flex',justifyContent:'flex-end',marginTop:12}}><button className="primary-btn" onClick={savePurchase} disabled={!products.length}><Plus size={16}/> تسجيل واستلام البضاعة</button></div>
            </section>
            <section className="stats-grid">
              <Stat icon={<CircleDollarSign />} label="إجمالي الديون" value={money(supplierDebts.reduce((sum, debt) => sum + debt.amount, 0))} foot="إجمالي المبالغ المسجلة للموردين" />
              <Stat icon={<Wallet />} label="إجمالي المسدد" value={money(supplierDebts.reduce((sum, debt) => sum + debtPaid(debt), 0))} foot="مدفوعات مسجلة ومربوطة بالخزنة" />
              <Stat icon={<AlertTriangle />} label="المتبقي" value={money(supplierDebts.reduce((sum, debt) => sum + debtRemaining(debt), 0))} foot="رصيد الديون الحالي" warning={supplierDebts.some(debt => debtRemaining(debt) > 0)} />
              <Stat icon={<AlertTriangle />} label="ديون متأخرة" value={String(overdueSupplierDebts.length)} foot="موعد السداد عدى ولسه فيه متبقي" warning={overdueSupplierDebts.length > 0} />
            </section>
            {overdueSupplierDebts.length > 0 && <div className="notice" role="status">تنبيه: يوجد {overdueSupplierDebts.length} دين مورد متأخر عن موعد السداد. راجع القائمة أدناه.</div>}
            <section className="panel">
              <div className="panel-head products-head"><div><h3>تسجيل دين مورد</h3><p>سجّل قيمة الدين وموعد استحقاقه لمتابعة السداد.</p></div></div>
              <div className="form-grid">
                <label className="field"><span>اسم المورد *</span><input value={debtSupplier} onChange={e => setDebtSupplier(e.target.value)} placeholder="اسم المورد" /></label>
                <label className="field"><span>رقم الهاتف</span><input value={debtPhone} onChange={e => setDebtPhone(e.target.value)} placeholder="رقم التواصل" /></label>
                <label className="field"><span>رقم فاتورة / مرجع</span><input value={debtReference} onChange={e => setDebtReference(e.target.value)} placeholder="اختياري" /></label>
                <label className="field"><span>قيمة الدين *</span><input type="number" min="0.01" step="0.01" value={debtAmount} onChange={e => setDebtAmount(e.target.value)} placeholder="0.00" /></label>
                <label className="field"><span>تاريخ الدين *</span><input type="date" value={debtDate} onChange={e => setDebtDate(e.target.value)} /></label>
                <label className="field"><span>موعد السداد *</span><input type="date" value={debtDueDate} onChange={e => setDebtDueDate(e.target.value)} /></label>
                <label className="field"><span>بيان / ملاحظات</span><input value={debtDescription} onChange={e => setDebtDescription(e.target.value)} placeholder="تفاصيل الدين أو المشتريات" /></label>
              </div>
              <div style={{display:'flex',justifyContent:'flex-end',marginTop:14}}><button className="primary-btn" onClick={addSupplierDebt}><Plus size={17}/> تسجيل الدين</button></div>
            </section>
            <section className="panel">
              <div className="panel-head products-head"><div><h3>سداد دين مورد</h3><p>كل دفعة تُسجل مرة واحدة كمدفوع في الدين ومصروف في الخزنة.</p></div></div>
              <div className="form-grid">
                <label className="field"><span>اختر الدين</span><select value={payingDebtId} onChange={e => { setPayingDebtId(e.target.value); const d=supplierDebts.find(x=>x.id===e.target.value); setDebtPaymentAmount(d ? String(debtRemaining(d)) : '') }}><option value="">اختر المورد / الدين</option>{supplierDebts.filter(debt=>debtRemaining(debt)>0).map(debt=><option key={debt.id} value={debt.id}>{debt.supplier} — متبقي {money(debtRemaining(debt))}</option>)}</select></label>
                <label className="field"><span>مبلغ السداد</span><input type="number" min="0.01" step="0.01" value={debtPaymentAmount} onChange={e=>setDebtPaymentAmount(e.target.value)} placeholder="0.00"/></label>
                <label className="field"><span>ملاحظات السداد</span><input value={debtPaymentNote} onChange={e=>setDebtPaymentNote(e.target.value)} placeholder="اختياري"/></label>
              </div>
              <div style={{display:'flex',justifyContent:'flex-end',marginTop:14}}><button className="primary-btn" disabled={!payingDebtId} onClick={recordSupplierDebtPayment}><Check size={17}/> تأكيد السداد</button></div>
            </section>
            <section className="panel">
              <div className="panel-head products-head"><div><h3>سجل ديون الموردين</h3><p>كشف حساب لكل دين مع إمكانية الطباعة أو الحفظ PDF.</p></div><span className="muted">{filteredSupplierDebts.length} سجل</span></div>
              <div className="toolbar"><label className="searchbox"><Search size={18}/><input value={debtSearch} onChange={e=>setDebtSearch(e.target.value)} placeholder="ابحث باسم المورد أو الهاتف أو المرجع..."/></label><button className="secondary-btn" onClick={()=>setDebtSearch('')}>مسح البحث</button></div>
              {filteredSupplierDebts.length ? <div className="table-wrap"><table><thead><tr><th>المورد</th><th>المرجع</th><th>تاريخ الدين</th><th>موعد السداد</th><th>قيمة الدين</th><th>المسدد</th><th>المتبقي</th><th>الحالة</th><th>كشف حساب</th></tr></thead><tbody>{filteredSupplierDebts.map(debt=>{const remaining=debtRemaining(debt); const overdue=remaining>0&&!!debt.dueDate&&debt.dueDate<today(); return <tr key={debt.id}><td className="product-cell">{debt.supplier}<div className="muted">{debt.phone||''}</div></td><td>{debt.reference||'—'}</td><td>{debt.date}</td><td>{debt.dueDate}</td><td>{money(debt.amount)}</td><td>{money(debtPaid(debt))}</td><td><strong>{money(remaining)}</strong></td><td><span className={remaining===0?'pill success':overdue?'pill danger':'pill warning'}>{remaining===0?'مسدد بالكامل':overdue?'متأخر':'مستحق'}</span></td><td><button className="secondary-btn" onClick={()=>printSupplierDebtStatement(debt)}><Printer size={15}/> طباعة PDF</button></td></tr>})}</tbody></table></div> : <Empty title="لا توجد ديون موردين" detail="سجّل أول دين من النموذج أعلاه أو غيّر كلمة البحث."/>}
            </section>
          </>
        )}

        {tab === 'reports' && (
          <section className="reports-page" dir="rtl">
            <div className="panel"><div className="panel-head"><div><h3>مركز التقارير</h3><p>راجع المبيعات وحركة الخزنة والمخزون خلال الفترة التي تحددها.</p></div><span className="muted">AL / DATA</span></div>
              <div className="report-filters">
                <label>من تاريخ<input type="date" value={reportFrom} onChange={e=>setReportFrom(e.target.value)} /></label>
                <label>إلى تاريخ<input type="date" value={reportTo} onChange={e=>setReportTo(e.target.value)} /></label>
                <label>نوع التقرير<select value={reportKind} onChange={e=>setReportKind(e.target.value as 'sales'|'cash'|'inventory')}><option value="sales">المبيعات والفواتير</option><option value="cash">الخزنة والحركة المالية</option><option value="inventory">الأصناف والمخزون</option></select></label>
                {reportKind === 'sales' && <label>فئة الصنف<select value={reportCategoryFilter} onChange={e=>setReportCategoryFilter(e.target.value)}><option value="all">كل الفئات</option>{Array.from(new Set(products.map(p=>p.category).filter(Boolean))).map(category=><option key={category} value={category}>{category}</option>)}</select></label>}
                <button className="secondary-btn" onClick={()=>{setReportFrom('');setReportTo('')}}>مسح الفترة</button>
              </div>
            </div>
            <div className="report-stats">
              {reportKind==='sales'?<><Stat icon={<Receipt/>} label="إجمالي المبيعات" value={money(reportSales)} foot={reportInvoices.length+' فاتورة'}/><Stat icon={<Wallet/>} label="المحصّل" value={money(reportCollected)} foot="حسب مبالغ السداد المسجلة"/><Stat icon={<AlertTriangle/>} label="المتبقي" value={money(reportBalance)} foot="مستحقات العملاء" warning={reportBalance>0}/></>:reportKind==='cash'?<><Stat icon={<ArrowDownLeft/>} label="مبالغ داخلة" value={money(reportCashIn)} foot="إجمالي الداخل"/><Stat icon={<ArrowUpRight/>} label="مبالغ خارجة" value={money(reportCashOut)} foot="إجمالي الخارج"/><Stat icon={<Wallet/>} label="صافي الحركة" value={money(reportCashIn-reportCashOut)} foot="داخل ناقص خارج"/></>:<><Stat icon={<Package/>} label="عدد الأصناف" value={String(products.length)} foot="الأصناف المسجلة"/><Stat icon={<Boxes/>} label="إجمالي الوحدات" value={String(products.reduce((s,p)=>s+p.quantity,0))} foot="الرصيد الحالي"/><Stat icon={<AlertTriangle/>} label="أصناف منخفضة" value={String(lowStock.length)} foot="عند الحد الأدنى أو أقل" warning={lowStock.length>0}/></>}
            </div>
            <div className="panel"><div className="panel-head"><div><h3>{reportKind==='sales'?'تفاصيل الفواتير':reportKind==='cash'?'الحركات المالية':'كشف المخزون'}</h3><p>التصدير يشمل البيانات المحددة أدناه.</p></div><div className="report-actions">{reportKind==='sales'&&<button className="secondary-btn" onClick={closeMonth}><CalendarCheck size={16}/> حفظ إقفال الشهر</button>}
              <button className="primary-btn" onClick={async()=>{
                const headers=reportKind==='sales'?['التاريخ','رقم الفاتورة','العميل','الإجمالي','المدفوع','المتبقي','الحالة']:reportKind==='cash'?['التاريخ','النوع','البند','ملاحظات','المبلغ']:['كود الصنف','اسم الصنف','الفئة','الكمية','حد التنبيه','سعر البيع','تكلفة الوحدة','قيمة المخزون بسعر التكلفة'];
                const rows:(string|number)[][]=reportKind==='sales'?reportInvoices.map(i=>[i.date,i.number,i.customer,reportInvoiceTotalFor(i),reportInvoicePaidFor(i),outstandingBalanceFor(reportInvoiceTotalFor(i),reportInvoicePaidFor(i)),i.status==='paid'?'مدفوعة':i.status==='partial'?'جزئيًا':'غير مدفوعة']):reportKind==='cash'?reportCash.map(e=>[e.date,e.kind==='in'?'داخل':'خارج',e.category,e.note,e.amount]):products.map(p=>[p.code,p.name,p.category,p.quantity,p.minStock,p.price,p.costPrice??0,p.quantity*(p.costPrice??0)]);
                const fileName=(reportKind==='sales'?'alarabi-sales':reportKind==='cash'?'alarabi-cash':'alarabi-inventory')+'-'+today()+'.xlsx';
                try {
                  const {default:ExcelJS}=await import('exceljs');
                  const workbook=new ExcelJS.Workbook();
                  const sheet=workbook.addWorksheet(reportKind==='sales'?'المبيعات':reportKind==='cash'?'الخزنة':'المخزون');
                  sheet.columns=headers.map((header,index)=>({header,key:'column'+index,width:Math.min(32,Math.max(14,String(header).length+4,...rows.map(row=>String(row[index]??'').length+2)))}));
                  sheet.addRows(rows);
                  const buffer=await workbook.xlsx.writeBuffer();
                  const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
                  const link=document.createElement('a');link.href=url;link.download=fileName;document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
                  setNotice('تم تصدير ملف Excel بصيغة XLSX بنجاح')
                } catch (error) {
                  setNotice('تعذر تصدير ملف Excel: '+(error instanceof Error?error.message:'خطأ غير متوقع'))
                }
              }}><Download size={16}/> تصدير Excel</button>
              <button className="secondary-btn" onClick={()=>{
                const headers=reportKind==='sales'?['التاريخ','رقم الفاتورة','العميل','الإجمالي الصافي','المحصّل بعد الرد','المتبقي','الحالة']:reportKind==='cash'?['التاريخ','النوع','البند','ملاحظات','المبلغ']:['كود الصنف','اسم الصنف','الفئة','الكمية','حد التنبيه','سعر البيع','تكلفة الوحدة','قيمة المخزون'];
                const rows:(string|number)[][]=reportKind==='sales'?reportInvoices.map(i=>[i.date,i.number,i.customer,reportInvoiceTotalFor(i),reportInvoicePaidFor(i),outstandingBalanceFor(reportInvoiceTotalFor(i),reportInvoicePaidFor(i)),i.status==='paid'?'مدفوعة':i.status==='partial'?'جزئيًا':'غير مدفوعة']):reportKind==='cash'?reportCash.map(e=>[e.date,e.kind==='in'?'داخل':'خارج',e.category,e.note,e.amount]):products.map(p=>[p.code,p.name,p.category,p.quantity,p.minStock,p.price,p.costPrice??0,p.quantity*(p.costPrice??0)]);
                const title=reportKind==='sales'?'تقرير المبيعات والفواتير':reportKind==='cash'?'تقرير الخزنة والحركة المالية':'تقرير الأصناف والمخزون';
                const table='<table><thead><tr>'+headers.map(h=>'<th>'+escapeHtml(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(v=>'<td>'+escapeHtml(String(v??''))+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
                const html='<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escapeHtml(title)+'</title><style>body{font:12px Tahoma,Arial,sans-serif;color:#263746;padding:20px}.actions{display:flex;gap:8px;justify-content:flex-start;margin:0 0 16px}.actions button{border:0;border-radius:6px;padding:9px 14px;background:#173653;color:white;font-weight:bold;cursor:pointer}.actions button.secondary{background:#edf1f5;color:#263746}.brand{border-bottom:3px solid #c83d46;padding-bottom:12px;margin-bottom:18px}h1{color:#173653;border-right:5px solid #c83d46;padding-right:12px}table{width:100%;border-collapse:collapse;margin-top:18px}th{background:#173653;color:white}th,td{border:1px solid #cfd7df;padding:8px;text-align:right}tr:nth-child(even){background:#f1f4f7}@page{size:A4 landscape;margin:12mm}@media print{body{padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.actions{display:none}}</style></head><body><div class="actions"><button onclick="window.print()">طباعة التقرير</button><button class="secondary" onclick="if(window.alarabiDesktop){window.alarabiDesktop.savePreviewPdf().then(r=>{if(r.ok)alert(&#39;تم حفظ التقرير PDF&#39;)}).catch(e=>alert(&#39;تعذر حفظ PDF: &#39;+e.message))}else{window.print()}">حفظ PDF</button></div><div class="brand"><h1>'+escapeHtml(title)+'</h1><strong>'+escapeHtml(companySettings.name)+'</strong><p>الفترة: '+escapeHtml(reportFrom||'من البداية')+' — '+escapeHtml(reportTo||'حتى اليوم')+' | تاريخ التصدير: '+escapeHtml(today())+'</p></div>'+table+'</body></html>';
                printDocument(html,'التقرير')
              }}><Printer size={16}/> طباعة / حفظ PDF</button>
            </div></div>
            <div className="table-wrap"><table><thead><tr>{(reportKind==='sales'?['التاريخ','رقم الفاتورة','العميل','الإجمالي الصافي','المحصّل','المتبقي','الحالة']:reportKind==='cash'?['التاريخ','النوع','البند','ملاحظات','المبلغ']:['الكود','الصنف','الفئة','الكمية','حد التنبيه','سعر البيع','تكلفة الوحدة','قيمة المخزون']).map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
              {reportKind==='sales'?reportInvoices.map(i=><tr key={i.id}><td>{i.date}</td><td>{i.number}</td><td>{i.customer}</td><td>{money(reportInvoiceTotalFor(i))}</td><td>{money(reportInvoicePaidFor(i))}</td><td>{money(outstandingBalanceFor(reportInvoiceTotalFor(i),reportInvoicePaidFor(i)))}</td><td>{i.status==='paid'?'مدفوعة':i.status==='partial'?'جزئيًا':'غير مدفوعة'}</td></tr>):reportKind==='cash'?reportCash.map(e=><tr key={e.id}><td>{e.date}</td><td>{e.kind==='in'?'داخل':'خارج'}</td><td>{e.category}</td><td>{e.note||'—'}</td><td>{money(e.amount)}</td></tr>):products.map(p=><tr key={p.id}><td>{p.code}</td><td>{p.name}</td><td>{p.category}</td><td>{p.quantity}</td><td>{p.minStock}</td><td>{money(p.price)}</td><td>{money(p.costPrice??0)}</td><td>{money(p.quantity*(p.costPrice??0))}</td></tr>)}
              {reportKind==='sales'&&!reportInvoices.length&&<tr><td colSpan={7}>لا توجد فواتير في الفترة المحددة.</td></tr>}{reportKind==='cash'&&!reportCash.length&&<tr><td colSpan={5}>لا توجد حركات في الفترة المحددة.</td></tr>}{reportKind==='inventory'&&!products.length&&<tr><td colSpan={8}>لا توجد أصناف.</td></tr>}
            </tbody></table></div></div>
            {(operations.monthCloses || []).length > 0 && <section className="panel"><div className="panel-head"><div><h3>لقطات إقفال الشهور</h3><p>نسخ مراجعة محفوظة وقت الإقفال؛ الربح تقديري حسب تكاليف الأصناف المسجلة.</p></div></div><div className="table-wrap"><table><thead><tr><th>الشهر</th><th>الفواتير</th><th>صافي المبيعات</th><th>المحصّل</th><th>المصروفات</th><th>الربح التقديري</th><th>وقت الحفظ</th></tr></thead><tbody>{operations.monthCloses?.map(close=><tr key={close.month}><td>{close.month}</td><td>{close.invoiceCount}</td><td>{money(close.sales)}</td><td>{money(close.collected)}</td><td>{money(close.expenses)}</td><td>{money(close.profit)}</td><td>{new Date(close.closedAt).toLocaleString('ar-EG')}</td></tr>)}</tbody></table></div></section>}
          </section>
        )}

        {tab === 'invoices' && (
          <>
            <section className="stats-grid invoice-stats">
              <Stat icon={<Receipt />} label="إجمالي الفواتير" value={String(invoices.length)} foot="فاتورة مسجلة" />
              <Stat icon={<CircleDollarSign />} label="إجمالي المبيعات" value={money(invoices.reduce((s, i) => s + netInvoiceTotalFor(i), 0))} foot="صافي بعد المرتجعات" />
              <Stat icon={<Check />} label="المحصّل" value={money(invoices.reduce((s, i) => s + invoicePaidAfterReturns(i), 0))} foot="بعد المبالغ المردودة" />
              <Stat icon={<AlertTriangle />} label="المتبقي" value={money(invoices.reduce((s, i) => s + outstandingBalanceFor(netInvoiceTotalFor(i), invoicePaidAfterReturns(i)), 0))} foot="مبالغ مستحقة" warning={invoices.some(i => netInvoiceTotalFor(i) > invoicePaidAfterReturns(i))} />
            </section>
            <section className="panel">
              <div className="panel-head products-head">
                <div><h3>إدارة الفواتير</h3><p>إنشاء فاتورة، متابعة التحصيل، وطباعة نسخة PDF</p></div>
                <button className="primary-btn" onClick={() => { resetInvoiceDraft(); setInvoiceModal(true) }}><Plus size={17} /> فاتورة جديدة</button>
              </div>
              <div className="toolbar"><label className="searchbox"><Search size={18} /><input value={archiveQuery} onChange={e => setArchiveQuery(e.target.value)} placeholder="ابحث برقم الفاتورة أو اسم العميل أو التاريخ..." /></label><label className="field invoice-status-filter"><span>الحالة</span><select value={invoiceStatusFilter} onChange={e=>setInvoiceStatusFilter(e.target.value as 'all'|'returned'|Invoice['status'])}><option value="all">كل الحالات</option><option value="paid">مدفوعة</option><option value="partial">مدفوعة جزئيًا</option><option value="unpaid">غير مدفوعة</option><option value="returned">مرتجعة بالكامل</option></select></label><span className="muted">{filteredInvoices.length} فاتورة</span><button className="secondary-btn" onClick={() => {setArchiveQuery('');setInvoiceStatusFilter('all')}}>مسح البحث</button></div>
              {filteredInvoices.length ? <div className="table-wrap"><table>
                <thead><tr><th>رقم الفاتورة</th><th>العميل</th><th>التاريخ</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th><th>إجراءات</th></tr></thead>
                <tbody>{filteredInvoices.map(inv => {
                  const total = netInvoiceTotalFor(inv)
                  const paid = invoicePaidAfterReturns(inv)
                  const balance = Math.max(0, total - paid)
                  return <tr key={inv.id}>
                    <td><code>{inv.number}</code></td><td className="product-cell">{inv.customer}</td><td>{inv.date}</td>
                    <td>{money(total)}</td><td>{money(paid)}</td><td>{money(balance)}</td>
                    <td><span className={(inv as Invoice & {returned?:boolean}).returned ? 'pill warning' : inv.status === 'paid' ? 'pill success' : 'pill danger'}>{(inv as Invoice & {returned?:boolean}).returned ? 'مرتجعة' : inv.status === 'paid' ? 'مدفوعة' : inv.status === 'partial' ? 'مدفوعة جزئيًا' : 'غير مدفوعة'}</span></td>
                    <td className="actions">
                      <button className="icon-btn" aria-label="طباعة الفاتورة" onClick={() => printInvoice(inv)}><Printer size={16} /></button>
                      <button className="secondary-btn invoice-status-btn" onClick={() => shareDocumentOnWhatsApp('فاتورة بيع', inv.number, inv.customer, inv.date, total, (inv as Invoice & {returned?:boolean}).returned ? 0 : balance)}><MessageCircle size={14}/> واتساب</button>
                      <button className="secondary-btn invoice-status-btn" onClick={() => printCustomerStatement(inv.customer)}>كشف العميل</button>
                      {inv.status !== 'paid' && !(inv as Invoice & {returned?:boolean}).returned && <button className="secondary-btn invoice-status-btn" onClick={() => recordInvoicePayment(inv)}>تحصيل دفعة</button>}
                      {!(inv as Invoice & {returned?:boolean}).returned && <button className="secondary-btn invoice-status-btn" onClick={() => returnInvoice(inv)} title="تسجيل مرتجع جزئي أو كامل وإعادة الكميات المحددة للمخزون"><RotateCcw size={14}/> مرتجع</button>}
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
                <p>أنشئ عرضًا واطبعه أو حوّله إلى فاتورة عند التنفيذ</p>
              </div>

              <button
                className="primary-btn"
                onClick={() => setQuoteModal(true)}
              >
                <Plus size={17} /> عرض سعر جديد
              </button>
            </div>

            <div className="toolbar"><label className="searchbox"><Search size={18} /><input value={archiveQuery} onChange={e => setArchiveQuery(e.target.value)} placeholder="ابحث برقم العرض أو اسم العميل أو الصنف..." /></label><label className="field quote-date-filter"><span>من تاريخ</span><input type="date" value={quoteFrom} onChange={e=>setQuoteFrom(e.target.value)} /></label><label className="field quote-date-filter"><span>إلى تاريخ</span><input type="date" value={quoteTo} onChange={e=>setQuoteTo(e.target.value)} /></label><button className="secondary-btn" onClick={() => {setArchiveQuery('');setQuoteFrom('');setQuoteTo('')}}>مسح البحث والتاريخ</button></div>
            <div className="quote-totals-strip"><span>{filteredQuotes.length} عرض سعر في النتائج</span><strong>إجمالي قيمة العروض: {money(filteredQuotes.reduce((sum, quote) => sum + itemsSubtotalFor(quote.items), 0))}</strong></div>
            {filteredQuotes.length ? (
              <div className="quote-list">
                {filteredQuotes.map(q => (
                  <div className="quote-list-row" key={q.id}>
                    <div className="quote-icon">
                      <FileText size={18} />
                    </div>

                    <div className="quote-info">
                      <b>{q.number}</b>
                      <span>
                        {q.customer} · {q.date} · {q.items.length} صنف{q.phone ? ' · ' + q.phone : ''}{q.followUpDate ? ' · متابعة ' + q.followUpDate : ''}
                      </span>
                    </div>

                    <strong>
                      {money(itemsSubtotalFor(q.items))}
                    </strong>

                    {invoices.some(invoice => invoice.id === q.convertedInvoiceId || invoice.quoteId === q.id) ? (
                      <span className="pill success">تم التنفيذ · {invoices.find(invoice => invoice.id === q.convertedInvoiceId || invoice.quoteId === q.id)?.number || 'فاتورة'}</span>
                    ) : (
                      <button className="secondary-btn quote-convert-btn" onClick={() => convertQuoteToInvoice(q)}><Receipt size={15} /> تم التنفيذ — إنشاء فاتورة</button>
                    )}

                    {!invoices.some(invoice => invoice.id === q.convertedInvoiceId || invoice.quoteId === q.id) && <select aria-label="حالة عرض السعر" value={q.status || 'new'} onChange={e => updateQuote(q, { status: e.target.value as NonNullable<Quote['status']> })}><option value="new">جديد</option><option value="follow-up">متابعة</option><option value="accepted">مقبول</option><option value="declined">مرفوض</option><option value="expired">منتهي</option></select>}
                    <input className="quote-date-filter" aria-label="موعد متابعة العرض" title="موعد المتابعة" type="date" value={q.followUpDate || ''} onChange={e => updateQuote(q, { followUpDate: e.target.value || undefined })} />
                    <button className="secondary-btn quote-convert-btn" onClick={() => duplicateQuote(q)} title="إنشاء عرض جديد بنفس الأصناف والبيانات"><Copy size={14}/> نسخة جديدة</button>

                    <button
                      className="icon-btn"
                      aria-label="طباعة عرض السعر"
                      onClick={() => printQuote(q)}
                    >
                      <Printer size={17} />
                    </button>
                    <button className="secondary-btn quote-convert-btn" onClick={() => shareDocumentOnWhatsApp('عرض سعر', q.number, q.customer, q.date, itemsSubtotalFor(q.items))}><MessageCircle size={14}/> واتساب</button>
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

        {tab === 'customers' && (
          <section className="panel"><div className="panel-head"><div><h3>العملاء والأرصدة</h3><p>ملخص الفواتير والتحصيل والمتبقي لكل عميل، مع ترتيب العملاء حسب إجمالي الشراء.</p></div></div><div className="toolbar"><label className="searchbox"><Search size={18}/><input value={customerSearch} onChange={e=>setCustomerSearch(e.target.value)} placeholder="ابحث باسم العميل أو الهاتف..."/></label><span className="muted">{customerSummaries.length} عميل</span></div><div className="table-wrap"><table><thead><tr><th>الترتيب</th><th>العميل</th><th>الهاتف</th><th>عدد الفواتير</th><th>إجمالي المبيعات</th><th>المحصّل</th><th>المتبقي</th><th>إجراء</th></tr></thead><tbody>{customerSummaries.filter(customer=>(customer.name+' '+customer.phone).toLocaleLowerCase().includes(customerSearch.trim().toLocaleLowerCase())).sort((a,b)=>b.sales-a.sales).map((customer,index)=><tr key={customer.name.toLocaleLowerCase()}><td>{index+1}</td><td>{customer.name}</td><td>{customer.phone || '—'}</td><td>{customer.invoices}</td><td>{money(customer.sales)}</td><td>{money(customer.paid)}</td><td><b>{money(customer.balance)}</b></td><td><button className="secondary-btn" onClick={()=>printCustomerStatement(customer.name)}><Printer size={14}/> كشف حساب</button> <button className="secondary-btn" onClick={()=>void exportCustomerStatementExcel(customer.name)}><Download size={14}/> Excel</button></td></tr>)}</tbody></table></div>{!customerSummaries.length&&<Empty title="لا توجد فواتير مسجلة" detail="سيظهر العميل هنا بعد إنشاء أول فاتورة."/>}</section>
        )}

        {tab === 'activity' && (
          <section className="panel"><div className="panel-head"><div><h3>سجل النشاط الأخير</h3><p>آخر الفواتير والعروض وحركات الخزنة والمخزون والتعديلات المسجلة.</p></div><span className="muted">{recentActivity.length} حركة</span></div>{recentActivity.length?<div className="table-wrap"><table><thead><tr><th>التاريخ والوقت</th><th>النشاط</th><th>المرجع</th><th>التفاصيل</th></tr></thead><tbody>{recentActivity.map(item=><tr key={item.id}><td>{new Date(item.date).toLocaleString('ar-EG')}</td><td>{item.action}</td><td>{item.reference || '—'}</td><td>{item.detail || '—'}</td></tr>)}</tbody></table></div>:<Empty title="لا يوجد نشاط مسجل بعد" detail="ستظهر هنا الحركات الجديدة تلقائيًا."/>}</section>
        )}

        {tab === 'settings' && (
          <>
          <section className="panel"><div className="panel-head"><div><h3>بيانات الفواتير وعروض الأسعار</h3><p>تظهر التعديلات التالية في المستندات الجديدة عند الطباعة والمشاركة.</p></div></div><div className="form-grid"><Field label="اسم الشركة" value={companySettings.name} onChange={v=>updateCompanyField('name',v)}/><Field label="العنوان" value={companySettings.address} onChange={v=>updateCompanyField('address',v)}/><Field label="البريد الإلكتروني" value={companySettings.email} onChange={v=>updateCompanyField('email',v)}/><Field label="اسم جهة التواصل الأولى" value={companySettings.contact1Name} onChange={v=>updateCompanyField('contact1Name',v)}/><Field label="هاتف جهة التواصل الأولى" value={companySettings.contact1Phone} onChange={v=>updateCompanyField('contact1Phone',v)}/><Field label="اسم جهة التواصل الثانية" value={companySettings.contact2Name} onChange={v=>updateCompanyField('contact2Name',v)}/><Field label="هاتف جهة التواصل الثانية" value={companySettings.contact2Phone} onChange={v=>updateCompanyField('contact2Phone',v)}/></div><div className="panel-head" style={{marginTop:18}}><div><h3>شعار المستندات</h3><p>اختياري: صورة PNG أو JPG أو WebP حتى 5 ميجابايت. الشعار لا يظهر في واجهة البرنامج.</p></div>{companySettings.logoDataUrl&&<img src={companySettings.logoDataUrl} alt="معاينة شعار الفواتير" style={{maxWidth:120,maxHeight:70,objectFit:'contain'}}/>}</div><div className="backup-actions"><label className="secondary-button" style={{cursor:'pointer'}}>اختيار شعار<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event=>void importCompanyLogo(event)}/></label>{companySettings.logoDataUrl&&<button className="secondary-btn" onClick={()=>setCompanySettings(old=>({...old,logoDataUrl:undefined}))}>إعادة الشعار الأصلي</button>}</div><div className="panel" style={{marginTop:20}}><h3>الحفظ والنسخ الاحتياطي</h3><p>المسودات محفوظة تلقائيًا على هذا الجهاز. قاعدة بيانات التطبيق تنشئ نسخة استرداد محلية كل 30 دقيقة وتحتفظ بآخر 24 نسخة. استخدم تنزيل نسخة JSON لحفظ نسخة خارج الجهاز.</p></div></section>
          <section className="panel"><div className="panel-head"><div><h3>هدف الشهر وقوالب الخصم</h3><p>تظهر القوالب داخل إنشاء الفاتورة، ويمكن تخصيص أسعار أصناف لعميل بعينه.</p></div></div><div className="form-grid"><Field label="هدف المبيعات للشهر الحالي" type="number" value={monthlyGoalDraft} onChange={setMonthlyGoalDraft} placeholder={monthlySalesTarget ? String(monthlySalesTarget) : 'قيمة بالجنيه'} /><div style={{display:'flex',alignItems:'end'}}><button className="primary-btn" onClick={saveMonthlyGoal}>حفظ الهدف</button></div><Field label="اسم قالب الخصم" value={discountTemplateName} onChange={setDiscountTemplateName} placeholder="مثال: عميل دائم"/><Field label="نسبة الخصم %" type="number" value={discountTemplateValue} onChange={setDiscountTemplateValue} placeholder="مثال: 5"/><div style={{display:'flex',alignItems:'end'}}><button className="secondary-btn" onClick={saveDiscountTemplate}>إضافة قالب</button></div></div>{operations.discountTemplates?.length ? <div className="template-chips">{operations.discountTemplates.map(template=><span className="pill" key={template.id}>{template.name} · {template.value}%</span>)}</div>:null}</section>
          <section className="panel"><div className="panel-head"><div><h3>سعر خاص لعميل</h3><p>السعر المسجل يطبق تلقائيًا عند إضافة الصنف في فاتورة بهذا الاسم.</p></div></div><div className="form-grid"><Field label="اسم العميل" value={customerTermName} onChange={setCustomerTermName} placeholder="اكتب نفس الاسم المستخدم في الفاتورة"/><label className="field"><span>الصنف</span><select value={customerTermProductId} onChange={e=>setCustomerTermProductId(e.target.value)}><option value="">اختر صنفًا</option>{products.map(product=><option key={product.id} value={product.id}>{product.name}</option>)}</select></label><Field label="السعر الخاص للوحدة" type="number" value={customerTermPrice} onChange={setCustomerTermPrice} placeholder="جنيه"/><div style={{display:'flex',alignItems:'end'}}><button className="secondary-btn" onClick={saveCustomerPrice}>حفظ السعر الخاص</button></div></div></section>
          </>
        )}
      </main>

      {returnInvoiceDraft && <div className="modal-backdrop" onClick={()=>setReturnInvoiceDraft(null)}><section className="modal wide" role="dialog" aria-modal="true" aria-labelledby="return-title" onClick={event=>event.stopPropagation()}><div className="modal-head"><div><h2 id="return-title">مرتجع جزئي · {returnInvoiceDraft.number}</h2><p>{returnInvoiceDraft.customer} — أدخل الكمية المراد إرجاعها لكل صنف.</p></div><button className="icon-btn" aria-label="إغلاق" onClick={()=>setReturnInvoiceDraft(null)}><X/></button></div><div className="table-wrap"><table><thead><tr><th>الصنف</th><th>سعر الوحدة</th><th>المباع</th><th>المتاح للإرجاع</th><th>كمية المرتجع</th></tr></thead><tbody>{returnInvoiceDraft.items.map((item,index)=>{const previouslyReturned=invoiceReturns(returnInvoiceDraft.id).flatMap(record=>record.items||[]).filter(row=>row.productId===item.productId).reduce((sum,row)=>sum+row.quantity,0);const available=Math.max(0,item.quantity-previouslyReturned);return <tr key={`${item.productId}-${index}`}><td>{item.name}</td><td>{money(item.price)}</td><td>{item.quantity}</td><td>{available}</td><td><input aria-label={`كمية مرتجع ${item.name}`} type="number" min="0" max={available} step="1" value={returnQuantities[item.productId]??'0'} onChange={event=>setReturnQuantities(old=>({...old,[item.productId]:event.target.value}))}/></td></tr>})}</tbody></table></div><div className="modal-actions"><button className="secondary-btn" onClick={()=>setReturnInvoiceDraft(null)}>إلغاء</button><button className="primary-btn" onClick={savePartialReturn}><RotateCcw size={16}/> اعتماد المرتجع</button></div></section></div>}

      {stocktakeOpen && (
        <div className="modal-backdrop" onClick={() => setStocktakeOpen(false)}>
          <section className="modal wide" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="modal-head"><div><h2>جرد المخزون</h2><p>أدخل الكمية الفعلية؛ ستظهر التسويات في سجل حركة المخزون بعد التأكيد.</p></div><button className="icon-btn" onClick={() => setStocktakeOpen(false)} aria-label="إغلاق"><X /></button></div>
            <div className="table-wrap"><table><thead><tr><th>الصنف</th><th>الكود</th><th>المسجل بالنظام</th><th>الكمية الفعلية</th><th>الفرق</th></tr></thead><tbody>{products.map(product => { const counted = Number(stocktakeCounts[product.id]); const difference = (Number.isFinite(counted) ? counted : product.quantity) - product.quantity; return <tr key={product.id}><td>{product.name}</td><td>{product.code}</td><td>{product.quantity}</td><td><input aria-label={'الكمية الفعلية ' + product.name} type="number" min="0" step="1" value={stocktakeCounts[product.id] ?? product.quantity} onChange={e => setStocktakeCounts(old => ({ ...old, [product.id]: e.target.value }))} /></td><td className={difference < 0 ? 'text-danger' : ''}>{difference > 0 ? '+' : ''}{difference}</td></tr> })}</tbody></table></div>
            <div className="modal-actions"><button className="secondary-btn" onClick={() => setStocktakeOpen(false)}>إلغاء</button><button className="primary-btn" onClick={saveStocktake}><Check size={16}/> اعتماد الجرد</button></div>
          </section>
        </div>
      )}

      {stockMovementModal && (
        <div className="modal-backdrop" onClick={() => setStockMovementModal(false)}>
          <section className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div><h2>تسجيل حركة مخزون</h2><p>حدد الصنف ونوع الحركة لتحديث الكمية وتسجيلها في السجل.</p></div>
              <button className="icon-btn" onClick={() => setStockMovementModal(false)} aria-label="إغلاق"><X /></button>
            </div>
            <div className="form-grid">
              <label className="field"><span>الصنف *</span>
                <select value={movementProductId} onChange={e => setMovementProductId(e.target.value)}>
                  {products.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name} (الكمية: {p.quantity})</option>)}
                </select>
              </label>
              <label className="field"><span>نوع الحركة *</span>
                <select value={movementKind} onChange={e => setMovementKind(e.target.value as 'in' | 'out')}>
                  <option value="in">دخول بضاعة — إضافة للكمية</option>
                  <option value="out">خروج بضاعة — خصم من الكمية</option>
                </select>
              </label>
              <Field label="الكمية *" type="number" value={movementQuantity} onChange={setMovementQuantity} placeholder="اكتب الكمية" />
              <Field label="سبب الحركة *" value={movementReason} onChange={setMovementReason} placeholder="شراء بضاعة، صرف لمشروع..." />
              <Field label="المرجع (اختياري)" value={movementReference} onChange={setMovementReference} placeholder="رقم إذن الصرف أو فاتورة الشراء" />
            </div>
            {products.find(p => p.id === movementProductId) && (
              <p className="muted" style={{ marginTop: 12 }}>الكمية الحالية: <strong>{products.find(p => p.id === movementProductId)?.quantity}</strong> — بعد الحركة: <strong>{(products.find(p => p.id === movementProductId)?.quantity ?? 0) + (movementKind === 'in' ? 1 : -1) * (Number(movementQuantity) > 0 ? Number(movementQuantity) : 0)}</strong></p>
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
              <button
                className="icon-btn"
                onClick={() => setProductModal(null)}
              >
                <X />
              </button>
            </div>
            {notice && <div role="alert" style={{ margin: '10px 0', padding: '10px 12px', border: '1px solid #e8c7a0', borderRadius: 8, background: '#fff8ed', color: '#7a4b16', fontSize: 13 }}>{notice}</div>}

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
              <Field label="المخزون المستهدف بعد الشراء" type="number" value={draft.targetStock} onChange={v => setDraft({ ...draft, targetStock: v })} />
              <Field label="موقع التخزين (رف / ممر)" value={draft.location} onChange={v => setDraft({ ...draft, location: v })} placeholder="مثال: رف A2" />
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
            <div className="form-grid"><Field label="رقم هاتف العميل" value={quotePhone} onChange={setQuotePhone} placeholder="01xxxxxxxxx" /><Field label="موعد متابعة العرض (اختياري)" type="date" value={quoteFollowUpDate} onChange={setQuoteFollowUpDate} /></div>

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

                    <strong>{money(lineTotalFor(row))}</strong>

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
        <div className="modal-backdrop" onClick={closeInvoiceModal}>
          <section className="modal wide" onClick={e => e.stopPropagation()}>
            <div className="modal-head"><div><h2>{convertingQuoteId ? 'تحويل عرض السعر إلى فاتورة' : 'إنشاء فاتورة جديدة'}</h2><p>{convertingQuoteId ? 'راجع بيانات العميل والكميات والمخزون والإجمالي قبل اعتماد الفاتورة.' : 'فاتورة بيع رسمية قابلة للطباعة أو الحفظ PDF'}</p></div><button className="icon-btn" onClick={closeInvoiceModal}><X /></button></div>
            {notice && <div role="alert" style={{ margin: '10px 0', padding: '10px 12px', border: '1px solid #e8c7a0', borderRadius: 8, background: '#fff8ed', color: '#7a4b16', fontSize: 13 }}>{notice}</div>}
            <div className="form-grid">
              <Field label="اسم العميل / الشركة *" value={invoiceCustomer} onChange={setInvoiceCustomer} placeholder="اسم العميل" />
              <Field label="رقم الهاتف" value={invoicePhone} onChange={setInvoicePhone} placeholder="01xxxxxxxxx" />
              <Field label="تاريخ الاستحقاق" type="date" value={invoiceDueDate} onChange={setInvoiceDueDate} />
              <Field label="الخصم (جنيه)" type="number" value={invoiceDiscount} onChange={setInvoiceDiscount} />
              {(operations.discountTemplates || []).length > 0 && <label className="field"><span>قالب خصم محفوظ</span><select value="" onChange={event=>{const selected=(operations.discountTemplates||[]).find(item=>item.id===event.target.value);if(selected){setInvoiceDiscount(String(roundMoney(invoiceSubtotal*selected.value/100)));setNotice(`تم تطبيق ${selected.name}`)}}}><option value="">اختر قالبًا...</option>{operations.discountTemplates?.map(template=><option key={template.id} value={template.id}>{template.name} · {template.value}%</option>)}</select></label>}
              <Field label="الضريبة (%)" type="number" value={invoiceTax} onChange={setInvoiceTax} />
              <Field label="المبلغ المدفوع (جنيه)" type="number" value={invoicePaid} onChange={v => {setInvoicePaid(v); setInvoiceStatus(Number(v) > 0 ? 'partial' : 'unpaid')}} />
            </div>
            <div className="pick-products"><h4>اختار الأصناف</h4>{products.map(p => <button className="pick-row" key={p.id} onClick={() => addInvoiceProduct(p)}><span><b>{p.name}</b><small>{p.code} · {money(p.price)} للوحدة · المتاح {p.quantity}</small></span><Plus size={18} /></button>)}</div>
            {quoteRows.length > 0 && <div className="quote-draft"><h4>تفاصيل الفاتورة</h4>{quoteRows.map(row => <div className="draft-row" key={row.productId}><span>{row.name}<small>{money(row.price)} للوحدة</small></span><input aria-label="الكمية" type="number" min="1" value={row.quantity} onChange={e => setQuoteRows(old => old.map(x => x.productId === row.productId ? {...x, quantity: Math.max(1, Number(e.target.value) || 1)} : x))} /><strong>{money(lineTotalFor(row))}</strong><button className="icon-btn delete" onClick={() => setQuoteRows(old => old.filter(x => x.productId !== row.productId))}><X size={16} /></button></div>)}
              <Field label="ملاحظات الفاتورة" value={invoiceNotes} onChange={setInvoiceNotes} placeholder="طريقة التسليم أو أي ملاحظات" />
              {lowMarginRows.length>0&&<div className="notice" role="status">تنبيه: يوجد {lowMarginRows.length} صنف سعر بيعه أقل من تكلفة الشراء المحفوظة. راجع السعر قبل الحفظ.</div>}
              <div className="invoice-summary"><div><span>إجمالي الأصناف</span><b>{money(invoiceSubtotal)}</b></div><div><span>الخصم</span><b>{money(invoiceDiscountValue)}</b></div><div><span>الضريبة</span><b>{money(invoiceTaxFor(invoiceSubtotal, invoiceDiscountValue, invoiceTaxValue))}</b></div><div className="total-row"><span>الإجمالي النهائي</span><strong>{money(invoiceTotal)}</strong></div><div><span>المتبقي للتحصيل</span><b>{money(invoiceBalance)}</b></div></div>
            </div>}
            <div className="modal-actions"><button className="secondary-btn" onClick={closeInvoiceModal}>إلغاء</button><button className="primary-btn" onClick={saveInvoice}><Check size={17} /> حفظ الفاتورة</button></div>
          </section>
        </div>
      )}

      {paymentInvoice && (
        <div className="modal-backdrop" onClick={() => setPaymentInvoice(null)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="payment-modal-title" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div><h2 id="payment-modal-title">تحصيل دفعة من فاتورة</h2><p>فاتورة {paymentInvoice.number} — {paymentInvoice.customer}</p></div>
              <button className="icon-btn" aria-label="إغلاق" onClick={() => setPaymentInvoice(null)}><X /></button>
            </div>
            <div className="form-grid">
              <div className="field"><span>المتبقي على الفاتورة</span><strong>{money(Math.max(0, netInvoiceTotalFor(paymentInvoice) - invoicePaidAfterReturns(paymentInvoice)))}</strong></div>
              <Field label="مبلغ التحصيل بالجنيه *" type="number" value={paymentAmount} onChange={setPaymentAmount} placeholder="اكتب مبلغ التحصيل" />
            </div>
            <div className="modal-actions">
              <button className="secondary-btn" onClick={() => setPaymentInvoice(null)}>إلغاء</button>
              <button className="primary-btn" onClick={confirmInvoicePayment}><Check size={17} /> تأكيد التحصيل</button>
            </div>
          </section>
        </div>
      )}

      {cashModal && (
        <div className="modal-backdrop" onClick={() => setCashModal(false)}><section className="modal" onClick={e => e.stopPropagation()}><div className="modal-head"><div><h2>تسجيل حركة مالية</h2><p>سجّل المقبوضات والمصروفات</p></div><button className="icon-btn" onClick={() => setCashModal(false)}><X /></button></div><div className="form-grid"><label className="field"><span>نوع الحركة</span><select value={cashKind} onChange={e => setCashKind(e.target.value as 'in' | 'out')}><option value="in">مبلغ داخل</option><option value="out">مبلغ خارج (مصروف)</option></select></label><Field label="المبلغ بالجنيه *" type="number" value={cashAmount} onChange={setCashAmount} placeholder="0.00" /><Field label="البند *" value={cashCategory} onChange={setCashCategory} placeholder="مثال: تحصيل عميل أو مصروف نقل" /><Field label="ملاحظات" value={cashNote} onChange={setCashNote} placeholder="تفاصيل إضافية (اختياري)" /></div><div className="modal-actions"><button className="secondary-btn" onClick={() => setCashModal(false)}>إلغاء</button><button className="primary-btn" onClick={addCashEntry}><Check size={17} /> حفظ الحركة</button></div></section></div>
      )}

      <footer className="footer">
        <span>
          © {new Date().getFullYear()} {companySettings.name}
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

function quoteHtml(q: Quote, settings: CompanySettings = DEFAULT_COMPANY_SETTINGS) {
  const subtotal = itemsSubtotalFor(q.items)
  const dateLabel = new Date(q.date + 'T12:00:00').toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
  const rows = q.items.length ? q.items.map((item, index) =>
    '<tr><td class="cell-num">' + (index + 1) + '</td><td class="ltr">' + escapeHtml(item.code) + '</td><td><strong class="line-name">' + escapeHtml(item.name) + '</strong></td><td class="cell-num">' + item.quantity + '</td><td class="cell-money">' + money(item.price) + '</td><td class="cell-money">' + money(lineTotalFor(item)) + '</td></tr>'
  ).join('') : '<tr><td class="empty-row" colspan="6">لا توجد أصناف في العرض.</td></tr>'
  return documentFrame('عرض سعر', 'QUOTATION', q.number, dateLabel,
    '<div class="party-card"><h3>بيانات العميل</h3><div class="party-line"><span>اسم العميل / الشركة</span><b>' + escapeHtml(q.customer) + '</b></div><div class="party-line"><span>رقم الهاتف</span><b>' + escapeHtml(q.phone || '—') + '</b></div><div class="party-line"><span>العنوان</span><b>—</b></div><div class="party-line"><span>تاريخ العرض</span><b>' + dateLabel + '</b></div></div>' +
    '<div class="party-card"><h3>بيانات العرض</h3><div class="party-line"><span>رقم العرض</span><b class="ltr">' + escapeHtml(q.number) + '</b></div><div class="party-line"><span>تاريخ الإصدار</span><b>' + dateLabel + '</b></div><div class="party-line"><span>ساري حتى</span><b>' + escapeHtml(q.validUntil || '7 أيام من تاريخ الإصدار') + '</b></div><div class="party-line"><span>طريقة الدفع</span><b>نقدًا / تحويل بنكي</b></div></div>',
    '<p class="doc-intro">نشكركم على اهتمامكم بالتعامل معنا، ويسعدنا تقديم عرض السعر التالي.</p><table class="items"><thead><tr><th class="cell-num">م</th><th>كود الصنف</th><th>الصنف / الوصف</th><th class="cell-num">الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<section class="totals-area"><div class="notes-box"><h3>ملاحظات وشروط</h3><p>يرجى مراجعة تفاصيل الأصناف والكميات والأسعار قبل اعتماد العرض.</p><ul><li>الأسعار تشمل التوريد فقط ما لم يُذكر خلاف ذلك.</li><li>مدة التوريد حسب التوفر في المخزون.</li><li>الضمان حسب شروط الشركة المصنعة.</li><li>هذا العرض ساري لمدة 7 أيام من تاريخ الإصدار.</li></ul></div><div class="totals-box"><div class="total-line"><span>إجمالي المبلغ قبل الخصم</span><b>' + money(subtotal) + '</b></div><div class="total-line"><span>الخصم</span><b>' + money(0) + '</b></div><div class="total-line"><span>إجمالي المبلغ بعد الخصم</span><b>' + money(subtotal) + '</b></div><div class="total-line"><span>الضريبة (0%)</span><b>' + money(0) + '</b></div><div class="total-line total-grand"><span>المبلغ الإجمالي</span><b>' + money(subtotal) + '</b></div></div></section><div class="terms"><strong>تنويه:</strong> يتم اعتماد الطلب بعد موافقة العميل على الكميات والأسعار وشروط التوريد.</div>' +
    '<section class="signatures"><div>توقيع المشتري</div><div>توقيع وختم المؤسسة</div></section>', settings)
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  )
}

function invoiceTotalFor(invoice: Invoice) {
  const subtotal = itemsSubtotalFor(invoice.items)
  return invoiceGrandTotalFor(subtotal, roundMoney(invoice.discount || 0), invoice.tax || 0)
}

function invoiceHtml(invoice: Invoice, settings: CompanySettings = DEFAULT_COMPANY_SETTINGS) {
  const subtotal = itemsSubtotalFor(invoice.items)
  const total = invoiceTotalFor(invoice)
  const balance = roundMoney(Math.max(0, total - invoice.paidAmount))
  const taxAmount = invoiceTaxFor(subtotal, invoice.discount, invoice.tax)
  const dateLabel = new Date(invoice.date + 'T12:00:00').toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
  const dueDateLabel = invoice.dueDate
    ? new Date(invoice.dueDate + 'T12:00:00').toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—'
  const statusLabel = invoice.status === 'paid' ? 'مدفوعة' : invoice.status === 'partial' ? 'مدفوعة جزئيًا' : 'غير مدفوعة'
  const rows = invoice.items.length ? invoice.items.map((item, index) =>
    '<tr><td class="cell-num">' + (index + 1) + '</td><td class="ltr">' + escapeHtml(item.code) + '</td><td><strong class="line-name">' + escapeHtml(item.name) + '</strong></td><td class="cell-num">' + item.quantity + '</td><td class="cell-money">' + money(item.price) + '</td><td class="cell-money">' + money(lineTotalFor(item)) + '</td></tr>'
  ).join('') : '<tr><td class="empty-row" colspan="6">لا توجد أصناف في الفاتورة.</td></tr>'
  const note = invoice.notes.trim() ? escapeHtml(invoice.notes) : '—'
  return documentFrame('فاتورة بيع', 'SALES INVOICE', invoice.number, dateLabel,
    '<div class="party-card"><h3>بيانات العميل</h3><div class="party-line"><span>اسم العميل / الشركة</span><b>' + escapeHtml(invoice.customer) + '</b></div><div class="party-line"><span>رقم الهاتف</span><b>' + escapeHtml(invoice.phone || 'غير مسجل') + '</b></div><div class="party-line"><span>العنوان</span><b>—</b></div></div>' +
    '<div class="party-card"><h3>بيانات الفاتورة</h3><div class="party-line"><span>تاريخ الإصدار</span><b>' + dateLabel + '</b></div><div class="party-line"><span>تاريخ الاستحقاق</span><b>' + dueDateLabel + '</b></div><div class="party-line"><span>حالة السداد</span><b class="status-text status-' + invoice.status + '">' + statusLabel + '</b></div></div>',
    '<table class="items"><thead><tr><th class="cell-num">م</th><th>كود الصنف</th><th>الوصف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<section class="totals-area"><div class="notes-box"><h3>ملاحظات وشروط</h3><p>' + note + '</p></div><div class="totals-box"><div class="total-line"><span>إجمالي الأصناف</span><b>' + money(subtotal) + '</b></div><div class="total-line"><span>الخصم</span><b>' + money(invoice.discount) + '</b></div><div class="total-line"><span>الضريبة (' + invoice.tax + '%)</span><b>' + money(taxAmount) + '</b></div><div class="total-line total-grand"><span>الإجمالي النهائي</span><b>' + money(total) + '</b></div><div class="total-line"><span>المبلغ المدفوع</span><b>' + money(invoice.paidAmount) + '</b></div><div class="total-line"><span>المتبقي</span><b>' + money(balance) + '</b></div></div></section>' +
    '<section class="signatures"><div>توقيع المشتري / المستلم</div><div>توقيع وختم المؤسسة</div></section>', settings)
}

function documentFrame(title: string, englishTitle: string, number: string, date: string, parties: string, content: string, settings: CompanySettings = DEFAULT_COMPANY_SETTINGS) {
  const contactMarkup = '<div class="footer-company"><strong>' + escapeHtml(settings.name) + '</strong><span>' + escapeHtml(settings.address) + '</span></div><div class="footer-contact"><span>' + escapeHtml(settings.contact1Name) + ' · ' + escapeHtml(settings.contact1Phone) + '</span><span>' + escapeHtml(settings.contact2Name) + ' · ' + escapeHtml(settings.contact2Phone) + '</span><span class="footer-email">' + escapeHtml(settings.email) + '</span></div>'
  const watermarkMarkup = settings.logoDataUrl ? '' : '<img class="watermark" src="' + alarabiWatermarkDataUrl + '" alt="" aria-hidden="true">'
  const styles = [
    ':root{--ink:#17191d;--orange:#ed5a20;--amber:#ff9d36;--line:#b9b9b9;--soft:#f2f2f2}',
    '*{box-sizing:border-box}html{background:#e9eaec}body{margin:0;padding:18px;background:#e9eaec;color:var(--ink);font:700 14px/1.55 "Segoe UI",Tahoma,Arial,sans-serif;text-rendering:optimizeLegibility;font-synthesis:weight}',
    '.actions{width:210mm;margin:0 auto 10px;display:flex;gap:8px;justify-content:flex-end}.actions button{min-height:38px;border:1px solid #292929;border-radius:5px;padding:9px 16px;background:#17191d;color:#fff;font:700 13px Tahoma,Arial;cursor:pointer}.actions button:first-child{background:linear-gradient(120deg,#e4481b,#ff8c28);border-color:#e4481b}.actions .secondary{background:#fff;color:#242424;border-color:#ccc}.actions button:focus-visible{outline:3px solid #ff9d36;outline-offset:2px}.actions button:hover{filter:brightness(1.08)}.actions button:active{opacity:.82}',
    '.sheet{width:210mm;min-height:297mm;margin:0 auto;background:#fff;position:relative;isolation:isolate;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 12px 40px #0002}.watermark{position:absolute;z-index:0;width:158mm;height:122mm;object-fit:contain;top:89mm;left:26mm;opacity:.29;pointer-events:none;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.hero{height:43mm;flex:0 0 43mm;position:relative;z-index:2;display:grid;grid-template-columns:1fr 1.2fr 1fr;align-items:center;gap:5mm;padding:5mm 9mm;color:#fff;background:radial-gradient(ellipse at center,rgba(113,37,13,.5),transparent 45%),linear-gradient(115deg,#08090b,#191919 49%,#08090b);border-bottom:1.5mm solid var(--orange);overflow:hidden}.hero:before,.hero:after{content:"";position:absolute;top:-35%;height:170%;width:4mm;background:linear-gradient(180deg,#ff9a27,#e52d20,#ff8f24);opacity:.85;transform:skew(-24deg)}.hero:before{left:4mm}.hero:after{right:4mm}.hero-message{position:relative;z-index:1;font-size:16px;line-height:1.45;font-weight:800;color:#f7f5f3}.hero-message strong{display:block;font-size:20px;color:#ff7a23;font-weight:900}.hero-logo{position:relative;z-index:1;width:100%;height:35mm;object-fit:contain;mix-blend-mode:screen}.hero-company{position:relative;z-index:1;text-align:left;font-size:13px;line-height:1.45;font-weight:900;color:#fff}.hero-company span{display:block;margin-top:3px;color:#ff9b34;font-size:10px;font-weight:700}',
    '.title-badge{position:relative;z-index:3;width:100mm;min-height:19mm;margin:-9mm auto 3mm;display:grid;place-content:center;text-align:center;color:#fff;background:linear-gradient(115deg,#111316,#28211b,#111316);border:1.2mm solid var(--orange);clip-path:polygon(5% 0,95% 0,100% 50%,95% 100%,5% 100%,0 50%);filter:drop-shadow(0 5px 6px #0005)}.title-badge strong{font-size:25px;line-height:1.25}.title-badge span{font-size:8px;letter-spacing:2px;color:#ffad57}',
    '.paper-content{position:relative;z-index:1;flex:1;padding:0 12mm 7mm}.party-grid{display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin:1mm 0 4mm}.party-card{min-height:33mm;border:1px solid #9c9c9c;background:rgba(255,255,255,.74)}.party-card h3{margin:0;padding:2.1mm 4mm;color:#fff;background:linear-gradient(100deg,#131416,#252525);border-right:1.3mm solid var(--orange);font-size:14px;font-weight:800}.party-line{min-height:8mm;display:flex;align-items:center;justify-content:space-between;gap:3mm;padding:1.3mm 3mm;border-bottom:1px solid #ddd}.party-line:last-child{border-bottom:0}.party-line span{color:#424242;font-size:12px;font-weight:700;white-space:nowrap}.party-line b{font-size:12px;font-weight:800;text-align:left;overflow-wrap:anywhere}.ltr{direction:ltr;unicode-bidi:embed;font-variant-numeric:tabular-nums}',
    '.meta-row{display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-bottom:4mm}.meta-box{min-height:9mm;border:1px solid #888;display:flex;align-items:stretch;background:#fff}.meta-box strong{min-width:31mm;display:grid;place-items:center;padding:1mm 3mm;color:#fff;background:linear-gradient(100deg,#141517,#282828);border-right:1.3mm solid var(--orange);font-size:12px;font-weight:800}.meta-box span{flex:1;display:grid;place-items:center;font-size:12px;font-weight:800;direction:ltr}',
    '.doc-intro{margin:0 0 3mm;font-size:13px;font-weight:700;color:#383838}.terms{margin-top:4mm;padding:2mm 3mm;border-right:1.2mm solid var(--orange);background:#f6f6f6;font-size:11px;font-weight:700}.terms strong{color:#c9471c}.status-text{padding:1mm 2.5mm;border-radius:3mm;font-weight:800}.status-paid{background:#e5f3e9;color:#237246}.status-partial{background:#fff2da;color:#8b641b}.status-unpaid{background:#fae7e5;color:#a23e39}.items{width:100%;border-collapse:collapse;border:1px solid #555;font-size:13px;font-weight:700;background:rgba(255,255,255,.76);font-variant-numeric:tabular-nums}.items thead{display:table-header-group}.items th{padding:2.8mm 2mm;color:#fff;text-align:right;background:linear-gradient(100deg,#111315,#282828);border-bottom:1mm solid var(--orange);font-size:13px;font-weight:800}.items th:first-child{width:8mm}.items th:nth-child(2){width:24mm}.items th:nth-child(4){width:16mm}.items th:nth-child(5),.items th:nth-child(6){width:27mm}.items td{padding:2.7mm 2mm;border:1px solid #bdbdbd;vertical-align:middle;font-weight:700}.items tbody tr:nth-child(even) td{background:rgba(245,245,245,.88)}.cell-num{text-align:center;white-space:nowrap;font-weight:800}.cell-money{white-space:nowrap;text-align:center;font-weight:800}.line-name{display:block;font-weight:800}.line-code{display:block;margin-top:1mm;color:#555;font-size:11px;font-weight:700;direction:ltr;text-align:right}.empty-row{text-align:center;color:#777;padding:9mm!important}',
    '.totals-area{display:grid;grid-template-columns:1.1fr .9fr;gap:5mm;margin-top:5mm}.notes-box,.totals-box{border:1px solid #aaa;background:rgba(255,255,255,.8)}.notes-box h3{margin:0;padding:2mm 3mm;background:linear-gradient(100deg,#131416,#242424);color:#fff;border-right:1.3mm solid var(--orange);font-size:13px;font-weight:800}.notes-box p{margin:0;padding:2mm 3mm;border-bottom:1px solid #e1e1e1;font-size:12px;font-weight:700;white-space:pre-wrap;overflow-wrap:anywhere}.notes-box ul{margin:1mm 0;padding:0 5mm 0 2mm;font-size:11px;font-weight:700;line-height:1.7}.total-line{display:flex;justify-content:space-between;gap:4mm;padding:1.8mm 3mm;border-bottom:1px solid #ddd;font-size:12px;font-weight:700}.total-line b{white-space:nowrap;font-weight:800}.total-grand{background:#1b1b1b;color:#fff;border-right:1.4mm solid var(--orange);font-size:13px;font-weight:900;padding:2.5mm 3mm}.total-grand b{color:#ffb064;font-weight:900}',
    '.signatures{display:grid;grid-template-columns:1fr 1fr;gap:16mm;margin-top:7mm}.signatures div{min-height:17mm;padding-top:9mm;border-top:1px solid #777;text-align:center;font-size:11px;font-weight:700}',
    '.footer{position:relative;z-index:1;min-height:27mm;margin-top:auto;padding:5mm 12mm;display:grid;grid-template-columns:1.15fr 1fr;gap:5mm;align-items:center;color:#fff;background:linear-gradient(105deg,#101113,#282828);border-top:1.5mm solid var(--orange);font-size:11px;font-weight:700}.footer-company{display:grid;gap:2mm}.footer-company strong{font-size:13px;font-weight:900}.footer-contact{display:grid;grid-template-columns:1fr 1fr;gap:1.5mm 4mm;font-weight:700}.footer-email{grid-column:span 2;direction:ltr;text-align:right;color:#ffb064;font-weight:800}',
    '@page{size:A4;margin:0}@media print{html,body{width:210mm;min-height:297mm;background:#fff;padding:0;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.actions{display:none!important}.sheet{width:210mm;min-height:297mm;margin:0;box-shadow:none;overflow:visible;break-after:page}.sheet:last-of-type{break-after:auto}.watermark{position:fixed;top:89mm;left:26mm}.hero,.title-badge,.party-card h3,.items th,.total-grand,.footer{print-color-adjust:exact;-webkit-print-color-adjust:exact}thead{display:table-header-group}tr,.party-card,.totals-area,.signatures,.footer{break-inside:avoid}}',
    '@media(max-width:800px){body{padding:8px}.actions{width:100%}.sheet{width:100%;min-height:0}.hero{height:auto;min-height:150px;grid-template-columns:.8fr 1.1fr .8fr;padding:12px 18px}.hero-message{font-size:12px}.hero-message strong{font-size:15px}.hero-logo{height:110px}.hero-company{font-size:11px}.hero-company span{font-size:8px}.paper-content{padding:0 18px 18px}.party-grid{gap:8px}.party-card h3{font-size:10px}.party-line{gap:4px;padding:5px}.party-line span,.party-line b{font-size:9px}.items{font-size:9px}.items th{font-size:9px;padding:8px 5px}.items td{padding:7px 5px}.totals-area{gap:8px}.notes-box p,.total-line{font-size:9px}.footer{padding:12px 18px;font-size:8px}}',
    '@media(max-width:560px){.hero{grid-template-columns:1fr 1.3fr;min-height:132px}.hero-message{grid-column:1;grid-row:1}.hero-logo{grid-column:2;grid-row:1/3}.hero-company{grid-column:1;grid-row:2;text-align:right}.party-grid{grid-template-columns:1fr}.meta-row{gap:6px}.meta-box strong{min-width:27mm;font-size:9px}.totals-area{grid-template-columns:1fr}.footer{grid-template-columns:1fr}.footer-contact{grid-template-columns:1fr}.footer-email{grid-column:auto}.signatures{gap:8mm}}',
  ].join('')
  return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + ' ' + escapeHtml(number) + ' — alarabisystem</title><style>' + styles + '</style></head><body>' +
    '<div class="actions"><button onclick="window.print()">طباعة ' + title + '</button><button class="secondary" onclick="if(window.alarabiDesktop){window.alarabiDesktop.savePreviewPdf().then(result=>{if(result.ok)alert(\'تم حفظ ملف PDF بنجاح\')})}else{window.print()}">حفظ PDF</button><button class="secondary" onclick="window.close()">إغلاق</button></div>' +
    '<main class="sheet">' + watermarkMarkup + '<header class="hero"><div class="hero-message">حماية اليوم<strong>لأمان الغد</strong></div><img class="hero-logo" src="' + (settings.logoDataUrl || alarabiLogoDataUrl) + '" alt="شعار المؤسسة"><div class="hero-company">' + escapeHtml(settings.name) + '<span>لأنظمة التأريض والحماية من الصواعق</span></div></header>' +
    '<div class="title-badge"><strong>' + title + '</strong><span>' + englishTitle + '</span></div><div class="paper-content"><section class="party-grid">' + parties + '</section>' +
    '<div class="meta-row"><div class="meta-box"><strong>رقم المستند</strong><span>' + escapeHtml(number) + '</span></div><div class="meta-box"><strong>التاريخ</strong><span>' + date + '</span></div></div>' + content +
    '</div><footer class="footer">' + contactMarkup + '</footer></main></body></html>'
}
export default function App() {
  const [user, setUser] = useState<AppUser | null>(null)
  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
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
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      const result = mode === 'login'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password, options: { data: { username: username.trim() } } })
      if (result.error) setMessage(result.error.message)
      else if (mode === 'signup' && !result.data.session) setMessage('تم إنشاء الحساب. راجع بريدك الإلكتروني لتأكيده، ثم سجّل الدخول.')
      else setMessage('تم تسجيل الدخول بنجاح.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'حصل خطأ غير متوقع. حاول مرة أخرى.')
    } finally {
      setBusy(false)
    }
  }
  if (checking) return <BrandedLoadingScreen caption="جارٍ تجهيز alarabisystem" />
  if (user) return <InventoryApp user={user} />
  return <div className="auth-page" dir="rtl"><form className="auth-card" onSubmit={submit}>
    <h1>مؤسسة العربي لأنظمة التأريض</h1>
    <p>سجّل الدخول إلى alarabisystem لإدارة المخزون والفواتير وعروض الأسعار.</p>
    {mode === 'signup' && <label>اسم المستخدم<input type="text" autoComplete="nickname" minLength={3} maxLength={40} required value={username} onChange={e => setUsername(e.target.value)} placeholder="اسم يظهر في حسابك" /></label>}
    <label>البريد الإلكتروني<input type="email" autoComplete="email" maxLength={254} required value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" /></label>
    <label>كلمة المرور<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} maxLength={256} required value={password} onChange={e => setPassword(e.target.value)} placeholder="8 أحرف على الأقل" /></label>
    {message && <div className="auth-message">{message}</div>}
    <button className="primary-btn auth-submit" disabled={busy}>{busy ? 'جارٍ التنفيذ...' : mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}</button>
    <button type="button" className="text-button auth-toggle" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage('') }}>{mode === 'login' ? 'أول مرة؟ أنشئ حسابًا' : 'لديك حساب؟ سجّل الدخول'}</button>
  </form></div>
}

function BrandedLoadingScreen({ caption }: { caption: string }) {
  return <main className="brand-loading" dir="rtl" aria-live="polite">
    <div className="loading-orbit loading-orbit-one" />
    <div className="loading-orbit loading-orbit-two" />
    <div className="loading-core" aria-hidden="true"><span /></div>
    <h1>alarabisystem</h1>
    <p>{caption}</p>
    <div className="loading-track"><span /></div>
  </main>
}
