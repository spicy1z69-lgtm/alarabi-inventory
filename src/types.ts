
export interface Product {
  id: string
  code: string
  name: string
  category: string
  quantity: number
  price: number
  minStock: number
}

export interface QuoteItem {
  productId: string
  name: string
  code: string
  quantity: number
  price: number
}

export interface Quote {
  id: string
  number: string
  customer: string
  date: string
  items: QuoteItem[]
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
}
