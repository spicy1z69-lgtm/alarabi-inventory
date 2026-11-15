const STATE_KEYS = new Set([
  'products',
  'quotes',
  'invoices',
  'cash',
  'supplier-debts',
  'stock-movements',
  'operations',
])

const LEGACY_STATE_KEYS = new Set([...STATE_KEYS].filter(key => key !== 'operations'))

function validateBundle(ownerId, records) {
  if (typeof ownerId !== 'string' || ownerId.length < 1 || ownerId.length > 128) {
    throw new Error('Invalid state owner')
  }
  if (!Array.isArray(records) || (records.length !== STATE_KEYS.size && records.length !== LEGACY_STATE_KEYS.size)) {
    throw new Error('A complete state bundle is required')
  }

  const seen = new Set()
  let totalSize = 0
  const serialized = records.map(record => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error('Invalid state record')
    }
    const { key, value } = record
    if (typeof key !== 'string' || !(records.length === LEGACY_STATE_KEYS.size ? LEGACY_STATE_KEYS : STATE_KEYS).has(key) || seen.has(key)) {
      throw new Error('Unsupported or duplicate state key')
    }
    seen.add(key)
    const stateValue = JSON.stringify(value)
    if (typeof stateValue !== 'string' || stateValue.length > 20_000_000) {
      throw new Error('State payload is invalid or too large')
    }
    totalSize += stateValue.length
    if (totalSize > 50_000_000) throw new Error('State bundle is too large')
    return { key, stateValue }
  })

  const expected = records.length === LEGACY_STATE_KEYS.size ? LEGACY_STATE_KEYS : STATE_KEYS
  if (seen.size !== expected.size) throw new Error('The state bundle is incomplete')
  return serialized
}

function writeStateBundle(db, ownerId, records) {
  const serialized = validateBundle(ownerId, records)
  const write = db.transaction(rows => {
    const upsert = db.prepare(`
      INSERT INTO app_state (owner_id, state_key, state_value, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(owner_id, state_key) DO UPDATE SET
        state_value = excluded.state_value,
        updated_at = excluded.updated_at
    `)
    const now = new Date().toISOString()
    for (const row of rows) upsert.run(ownerId, row.key, row.stateValue, now)
  })
  write(serialized)
  return { ok: true, count: serialized.length }
}

module.exports = { writeStateBundle }
