import  assert  from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createApp } from '../src/index.js'
import { getOrderStatus } from '../src/modules/orders/helpers.js'
import { TtlCache } from '../src/shared/cache/ttlCache.js'
import { createFeedEtag } from '../src/modules/restaurants/feedController.js'

const app = createApp()
let server
let baseUrl

before(async () => {
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
})

test('suggestions rank dishes that match the food request', async () => {
  const response = await fetch(`${baseUrl}/api/suggestions?q=${encodeURIComponent('mushroom pasta')}`)
  const data = await response.json()

  assert.equal(response.status, 200)
  assert.equal(data.items[0].id, 'mushroom-pasta')
})

test('suggestions require a useful query', async () => {
  const response = await fetch(`${baseUrl}/api/suggestions?q=x`)

  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /at least two characters/)
})

test('feed ETag reflects image and content changes even when item IDs are unchanged', () => {
  const items = [{ id: 'first', image: 'old' }, { id: 'middle', image: 'old' }, { id: 'last', image: 'old' }]
  const updated = items.map((item) => item.id === 'middle' ? { ...item, image: 'new' } : item)
  assert.equal(createFeedEtag(items), createFeedEtag(items))
  assert.notEqual(createFeedEtag(items), createFeedEtag(updated))
})

test('feed returns 304 for an unchanged ETag', async () => {
  const first = await fetch(`${baseUrl}/api/restaurants/feed`)
  assert.equal(first.status, 200)
  const etag = first.headers.get('etag')
  assert.ok(etag)
  const second = await fetch(`${baseUrl}/api/restaurants/feed`, { headers: { 'If-None-Match': etag } })
  assert.equal(second.status, 304)
  assert.equal(second.headers.get('etag'), etag)
})

test('orders can be created and tracked without processing payment', async () => {
  const createResponse = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      itemId: 'mushroom-pasta',
      customerName: 'Alex',
      address: '12 Main Street, Apt 4',
      paymentMethod: 'demo_card',
    }),
  })
  const created = await createResponse.json()

  assert.equal(createResponse.status, 201)
  assert.match(created.order.trackingNumber, /^SPN-[A-F0-9]{6}$/)
  assert.equal(created.order.paymentStatus, 'not_processed')

  const trackResponse = await fetch(`${baseUrl}/api/orders/${created.order.trackingNumber}`)
  const tracked = await trackResponse.json()
  assert.equal(trackResponse.status, 200)
  assert.equal(tracked.order.item.id, 'mushroom-pasta')
  assert.equal(tracked.order.status, 'placed')
  assert.equal(tracked.demo, true)
})

test('order creation validates customer details and payment mode', async () => {
  const response = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      itemId: 'mushroom-pasta',
      customerName: 'A',
      address: 'Home',
      paymentMethod: 'real_card',
    }),
  })

  assert.equal(response.status, 400)
})

test('demo order statuses advance with elapsed time', () => {
  const createdAt = 1_000
  assert.equal(getOrderStatus(createdAt, createdAt + 1), 'placed')
  assert.equal(getOrderStatus(createdAt, createdAt + 15_000), 'cooking')
  assert.equal(getOrderStatus(createdAt, createdAt + 30_000), 'on_the_way')
  assert.equal(getOrderStatus(createdAt, createdAt + 60_000), 'delivered')
})

test('suggestion cache expires after its TTL', () => {
  let now = 100
  const cache = new TtlCache(50, () => now)
  cache.set('query', ['result'])
  assert.deepEqual(cache.get('query'), ['result'])
  now = 150
  assert.equal(cache.get('query'), undefined)
})

test('cache rejects invalid TTL values', () => {
  assert.throws(() => new TtlCache(0), /positive number/)
})
