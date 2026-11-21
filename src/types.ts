
export interface Product {
  id: string
  code: string
  name: string
  category: string
  quantity: number
  price: number
  costPrice?: number
  minStock: number
  targetStock?: number
  location?: string
}

export interface QuoteItem {
  productId: string
  name: string
  code: string
  quantity: number
  price: number
  costPrice?: number
}

export interface Quote {
  id: string
  number: string
  customer: string
  date: string
  items: QuoteItem[]
  convertedInvoiceId?: string
  phone?: string
  followUpDate?: string
  validUntil?: string
  status?: 'new' | 'follow-up' | 'accepted' | 'declined' | 'expired'
}

export interface Invoice {
  id: string
  number: string
  customer: string
  phone: string
  date: string
  dueDate: string
  items: QuoteItem[]
  discount: number
  tax: number
  status: 'paid' | 'unpaid' | 'partial'
  paidAmount: number
  notes: string
  quoteId?: string
}
