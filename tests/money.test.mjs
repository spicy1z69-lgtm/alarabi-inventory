import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cashDifferenceFor, invoiceGrandTotalFor, invoiceTaxFor, itemsSubtotalFor, lineTotalFor, outstandingBalanceFor, roundMoney, weightedAverageCostFor } from '../src/lib/money.ts'

test('rounds every line and subtotal consistently to two currency decimals', () => {
  const items = [
    { quantity: 3, price: 0.1 },
    { quantity: 2, price: 0.2 },
  ]
  assert.equal(lineTotalFor(items[0]), 0.3)
  assert.equal(itemsSubtotalFor(items), 0.7)
  assert.equal(roundMoney(10.005), 10.01)
})

test('applies discount before tax and rounds tax before adding it to the total', () => {
  assert.equal(invoiceTaxFor(100, 10, 14), 12.6)
  assert.equal(invoiceGrandTotalFor(100, 10, 14), 102.6)
  assert.equal(invoiceTaxFor(0.01, 0, 50), 0.01)
  assert.equal(invoiceGrandTotalFor(0.01, 0, 50), 0.02)
})

test('calculates weighted inventory cost, invoice balances, and cash count differences', () => {
  assert.equal(weightedAverageCostFor(10, 5, 2, 8), 5.5)
  assert.equal(weightedAverageCostFor(10, 0, 2, 8), 8)
  assert.equal(outstandingBalanceFor(120.50, 20.25), 100.25)
  assert.equal(outstandingBalanceFor(10, 20), 0)
  assert.equal(cashDifferenceFor(500.25, 490), -10.25)
})
