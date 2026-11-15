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

/** Weighted average purchase cost. When opening stock has no known cost, use the first recorded purchase as its cost baseline. */
export const weightedAverageCostFor = (oldQuantity: number, oldUnitCost: number, receivedQuantity: number, receivedUnitCost: number) => {
  if (![oldQuantity, oldUnitCost, receivedQuantity, receivedUnitCost].every(Number.isFinite) || oldQuantity < 0 || oldUnitCost < 0 || receivedQuantity <= 0 || receivedUnitCost < 0) throw new Error('Invalid stock cost inputs')
  if (oldQuantity === 0 || oldUnitCost === 0) return roundMoney(receivedUnitCost)
  return roundMoney((oldQuantity * oldUnitCost + receivedQuantity * receivedUnitCost) / (oldQuantity + receivedQuantity))
}

export const outstandingBalanceFor = (total: number, paid: number) => roundMoney(Math.max(0, total - Math.max(0, paid)))

export const cashDifferenceFor = (expected: number, counted: number) => roundMoney(counted - expected)
