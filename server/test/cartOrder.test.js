import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.DATABASE_PATH = ':memory:'
const { database, findMenuItem } = await import('../src/database/database.js')
const { createOrder, getStatus } = await import('../src/modules/orders/controller.js')
const { registerGeneratedItems } = await import('../src/modules/restaurants/runtimeMenu.js')
await import('../src/index.js')

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

const customer = { customerName: 'Alex', address: '12 Main Street', paymentMethod: 'demo_card' }

test('one mixed cart order uses server prices, stays in memory and can be tracked', () => {
  const [generated] = registerGeneratedItems([{ id: 'mock', name: 'Generated pizza', restaurant: 'Test', price: 17, description: 'pizza', lat: 1, lng: 2 }])
  const seed = findMenuItem('mushroom-pasta')
  const before = database.prepare('SELECT COUNT(*) AS count FROM orders').get().count
  const result = response()
  createOrder({ body: { ...customer, itemIds: [seed.id, generated.id], totalAmount: 0 } }, result)

  assert.equal(result.statusCode, 201)
  assert.deepEqual(result.body.order.items.map((item) => item.id), [seed.id, generated.id])
  assert.deepEqual(result.body.order.items.map((item) => item.price), [seed.price, 17])
  assert.equal(result.body.order.totalAmount, Math.round((seed.price + 17) * 100) / 100)
  assert.equal(result.body.order.paymentStatus, 'not_processed')
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM orders').get().count, before)

  const tracked = response()
  getStatus({ params: { trackingNumber: result.body.order.trackingNumber } }, tracked)
  assert.equal(tracked.statusCode, 200)
  assert.deepEqual(tracked.body.order, result.body.order)
})

test('invalid, duplicate, unavailable or ambiguous selections fail without creating orders', () => {
  const before = database.prepare('SELECT COUNT(*) AS count FROM orders').get().count
  for (const fields of [
    { itemIds: [] },
    { itemIds: 'mushroom-pasta' },
    { itemIds: ['mushroom-pasta', 'mushroom-pasta'] },
    { itemIds: ['mushroom-pasta', 'missing'] },
    { itemIds: ['mushroom-pasta'], itemId: 'mushroom-pasta' },
    { itemIds: Array(101).fill('mushroom-pasta') },
  ]) {
    const result = response()
    createOrder({ body: { ...customer, ...fields } }, result)
    assert.equal(result.statusCode, 400)
    assert.ok(result.body.error)
    if (fields.itemIds?.includes('missing')) assert.match(result.body.error, /no longer available/)
  }
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM orders').get().count, before)
})
