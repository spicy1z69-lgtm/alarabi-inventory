import type { QuoteItem } from '../types'

/** Round monetary values to the two decimal places used by the invoice. */
export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

/** Round each document line before adding it, so printed rows and subtotals agree. */
export const lineTotalFor = (item: Pick<QuoteItem, 'quantity' | 'price'>) =>
  roundMoney(item.quantity * item.price)

export const itemsSubtotalFor = (items: Array<Pick<QuoteItem, 'quantity' | 'price'>>) =>
  roundMoney(items.reduce((sum, item) => sum + lineTotalFor(item), 0))

export const invoiceTaxFor = (subtotal: number, discount: number, taxRate: number) =>
  roundMoney(Math.max(0, subtotal - discount) * taxRate / 100)

export const invoiceGrandTotalFor = (subtotal: number, discount: number, taxRate: number) =>
  roundMoney(Math.max(0, subtotal - discount) + invoiceTaxFor(subtotal, discount, taxRate))
