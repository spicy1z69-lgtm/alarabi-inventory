const assert = require('node:assert/strict')
const { afterEach, beforeEach, test } = require('node:test')
const Database = require('better-sqlite3')
const { writeStateBundle } = require('../electron/stateStore.cjs')

let db

beforeEach(() => {
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE app_state (
      owner_id TEXT NOT NULL,
      state_key TEXT NOT NULL,
      state_value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (owner_id, state_key)
    );
  `)
})

afterEach(() => db?.close())

function bundle(name) {
  return [
    { key: 'products', value: [{ id: 'p1', name }] },
    { key: 'quotes', value: [] },
    { key: 'invoices', value: [] },
    { key: 'cash', value: [] },
    { key: 'supplier-debts', value: [] },
    { key: 'stock-movements', value: [] },
  ]
}

test('saves all six desktop state documents as one owner-scoped bundle', () => {
  assert.equal(writeStateBundle(db, 'local:user-a', bundle('A')).count, 6)
  assert.equal(writeStateBundle(db, 'local:user-b', bundle('B')).count, 6)

  const ownerA = db.prepare('SELECT state_value FROM app_state WHERE owner_id = ? AND state_key = ?').get('local:user-a', 'products')
  const ownerB = db.prepare('SELECT state_value FROM app_state WHERE owner_id = ? AND state_key = ?').get('local:user-b', 'products')
  assert.equal(JSON.parse(ownerA.state_value)[0].name, 'A')
  assert.equal(JSON.parse(ownerB.state_value)[0].name, 'B')
})

test('saves the added operations document together while keeping six-document legacy writes compatible', () => {
  const expanded = [...bundle('A'), { key: 'operations', value: { purchases: [], returns: [], cashCounts: [] } }]
  assert.equal(writeStateBundle(db, 'local:user-a', expanded).count, 7)
  assert.equal(writeStateBundle(db, 'local:user-b', bundle('B')).count, 6)
  const value = db.prepare('SELECT state_value FROM app_state WHERE owner_id = ? AND state_key = ?').get('local:user-a', 'operations')
  assert.deepEqual(JSON.parse(value.state_value), { purchases: [], returns: [], cashCounts: [] })
})

test('rolls back earlier writes if any state document fails', () => {
  db.exec(`
    CREATE TRIGGER fail_invoice_write BEFORE INSERT ON app_state
    WHEN NEW.state_key = 'invoices'
    BEGIN SELECT RAISE(ABORT, 'injected write failure'); END;
  `)
  assert.throws(() => writeStateBundle(db, 'local:user-a', bundle('A')), /injected write failure/)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM app_state').get().count, 0)
})

test('rejects incomplete or duplicate bundles before writing', () => {
  assert.throws(() => writeStateBundle(db, 'local:user-a', bundle('A').slice(0, 5)), /complete state bundle/)
  const invalid = bundle('A')
  invalid[1].key = 'products'
  assert.throws(() => writeStateBundle(db, 'local:user-a', invalid), /duplicate state key/)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM app_state').get().count, 0)
})
