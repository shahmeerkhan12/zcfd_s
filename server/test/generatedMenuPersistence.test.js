import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.DATABASE_PATH = ':memory:'
const { createApp } = await import('../src/index.js')
const { database, findMenuItem, findOrder, listAvailableMenuItems } = await import('../src/database/database.js')
const { matchMenuItems, searchRestaurants } = await import('../src/modules/restaurants/service.js')

test('only seed dishes are listed; generated dishes and their orders stay in memory', async () => {
  database.prepare(`
    INSERT INTO restaurants (name, rating, is_open, address, lat, lng)
    VALUES ('Legacy restaurant', 4.5, 1, 'Kyiv', 50.45, 30.52)
  `).run()
  const legacyRestaurant = database.prepare("SELECT id FROM restaurants WHERE name = 'Legacy restaurant'").get()
  database.prepare(`
    INSERT INTO menu_items (id, restaurant_id, title, description, price, prep_time_minutes, rating, keywords, is_available)
    VALUES ('legacy-pizza', ?, 'Legacy pizza', 'pizza', 19, 20, 4.5, '["pizza"]', 1)
  `).run(legacyRestaurant.id)
  database.prepare(`
    INSERT INTO orders (tracking_number, customer_name, address, payment_method, payment_status,
      status, restaurant_id, menu_item_id, total_amount, created_at, created_at_ms)
    VALUES ('SPN-LEGACY', 'Alex', '12 Main Street', 'on_delivery', 'not_processed',
      'placed', ?, 'legacy-pizza', 19, '2024-01-01T00:00:00.000Z', 1704067200000)
  `).run(legacyRestaurant.id)

  assert.equal(findMenuItem('legacy-pizza'), undefined)
  assert.equal(findOrder('SPN-LEGACY').itemId, 'legacy-pizza')
  assert.ok(!listAvailableMenuItems().some((item) => item.id === 'legacy-pizza'))
  assert.ok(!matchMenuItems({ cleanQuery: 'legacy pizza', category: 'pizza' }, 100).items.some((item) => item.id === 'legacy-pizza'))

  const originalFetch = globalThis.fetch
  const originalGroqKey = process.env.GROQ_API_KEY
  const originalFoursquareKey = process.env.FOURSQUARE_API_KEY
  process.env.GROQ_API_KEY = 'test-only'
  delete process.env.FOURSQUARE_API_KEY
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /api\.groq\.com/)
    const request = JSON.parse(options.body)
    const isMenu = request.messages[0].content.includes('menu generator')
    const content = isMenu
      ? { items: [{ id: 'mushroom-pasta', name: 'Generated Pizza', description: 'Test pizza', price: 17, prepTime: 20 }] }
      : { cleanQuery: 'pizza', category: 'pizza', dietary: [], maxBudget: null, speedPriority: false }
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }) }
  }

  const server = createApp().listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  const postOrder = (itemId, price) => originalFetch(`${url}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId, price, customerName: 'Alex', address: '12 Main Street', paymentMethod: 'on_delivery' }),
  })

  try {
    const restaurants = await searchRestaurants({ keyword: 'legacy pizza isolation' })
    assert.ok(!restaurants.restaurants.some((restaurant) => restaurant.name === 'Legacy restaurant'))
    const before = database.prepare('SELECT COUNT(*) AS count FROM menu_items').get().count
    const orderCount = database.prepare('SELECT COUNT(*) AS count FROM orders').get().count
    const search = await originalFetch(`${url}/api/restaurants?q=pizza`)
    const result = await search.json()
    assert.equal(result.menuSource, 'llm')
    const generated = result.items[0]
    assert.match(generated.id, /^generated-/)
    assert.notEqual(generated.id, 'mushroom-pasta')
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM menu_items').get().count, before)

    const feed = await (await originalFetch(`${url}/api/restaurants/feed`)).json()
    assert.ok(!feed.items.some((item) => item.id === 'legacy-pizza' || item.id === generated.id))
    const suggestions = await (await originalFetch(`${url}/api/suggestions?q=pizza`)).json()
    assert.ok(!suggestions.items.some((item) => item.id === 'legacy-pizza' || item.id === generated.id))
    assert.equal((await postOrder('legacy-pizza')).status, 400)

    const createdResponse = await postOrder(generated.id, 0)
    const created = await createdResponse.json()
    assert.equal(createdResponse.status, 201)
    assert.equal(created.order.item.price, 17)
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM orders').get().count, orderCount)
    const trackedResponse = await originalFetch(`${url}/api/orders/${created.order.trackingNumber}`)
    const tracked = await trackedResponse.json()
    assert.equal(trackedResponse.status, 200)
    assert.deepEqual(tracked.order, created.order)
    assert.equal(tracked.demo, true)

    const seedOrder = await (await postOrder('mushroom-pasta')).json()
    assert.equal(findOrder(seedOrder.order.trackingNumber).itemId, 'mushroom-pasta')
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM orders').get().count, orderCount + 1)
  } finally {
    globalThis.fetch = originalFetch
    if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY
    else process.env.GROQ_API_KEY = originalGroqKey
    if (originalFoursquareKey === undefined) delete process.env.FOURSQUARE_API_KEY
    else process.env.FOURSQUARE_API_KEY = originalFoursquareKey
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})
