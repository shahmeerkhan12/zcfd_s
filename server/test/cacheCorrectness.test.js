import assert from 'node:assert/strict'
import { test } from 'node:test'
import { menu } from '../data-mock/menu.js'
import { seedDatabase } from '../src/database/database.js'
import { normalizeQuery } from '../src/modules/llm/service.js'
import { generateMenuItems } from '../src/modules/restaurants/menuGenerator.js'
import { matchMenuItems } from '../src/modules/restaurants/service.js'

seedDatabase(menu)

test('normalization cache distinguishes inputs that differ after 200 characters', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: false })

  try {
    const prefix = `phase8-${'x'.repeat(220)}`
    const pizzaQuery = `${prefix} pizza request`
    const sushiQuery = `${prefix} sushi request`

    const pizza = await normalizeQuery(pizzaQuery)
    const sushi = await normalizeQuery(sushiQuery)

    assert.equal(pizza.category, 'pizza')
    assert.equal(sushi.category, 'sushi')
    assert.equal(sushi.cached, false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('normalization cache reuses an identical full input', async () => {
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = async () => {
    fetchCalls++
    return { ok: false }
  }

  try {
    const query = `phase8 identical normalization ${Date.now()} pasta`
    const first = await normalizeQuery(query)
    const callsAfterFirst = fetchCalls
    const repeated = await normalizeQuery(query)

    assert.equal(first.cached, false)
    assert.equal(repeated.cached, true)
    assert.equal(repeated.category, first.category)
    assert.equal(fetchCalls, callsAfterFirst)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('generated-menu cache separates cleanQuery and reuses identical inputs', async () => {
  const originalFetch = globalThis.fetch
  const originalGroqKey = process.env.GROQ_API_KEY
  let fetchCalls = 0
  process.env.GROQ_API_KEY = 'stage1-test-only'
  globalThis.fetch = async (_url, options) => {
    fetchCalls++
    const request = JSON.parse(options.body)
    const prompt = request.messages[1].content
    const cleanQuery = prompt.match(/The user is looking for: "([^"]+)"/)?.[1]
    const items = [{
      id: `stage1-generated-${fetchCalls}`,
      name: `Generated for ${cleanQuery}`,
      description: 'Mock generated dish.',
      price: 15,
      prepTime: 20,
      rating: 4.5,
      tag: 'Test',
      dietary: [],
    }]

    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ items }) } }],
      }),
    }
  }

  try {
    const restaurant = {
      id: 'stage1-key-test-restaurant',
      name: 'Stage 1 Key Test Restaurant',
      lat: 50.45,
      lng: 30.52,
    }
    const baseIntent = {
      category: 'pasta',
      dietary: ['vegetarian'],
      maxBudget: 20,
      speedPriority: false,
    }

    const first = await generateMenuItems(
      [restaurant],
      { ...baseIntent, cleanQuery: 'phase8 alpha pasta' },
    )
    const differentQuery = await generateMenuItems(
      [restaurant],
      { ...baseIntent, cleanQuery: 'phase8 beta pasta' },
    )
    const repeated = await generateMenuItems(
      [restaurant],
      { ...baseIntent, cleanQuery: 'phase8 alpha pasta' },
    )

    assert.equal(fetchCalls, 2)
    assert.match(first.items[0].name, /phase8 alpha pasta/)
    assert.match(differentQuery.items[0].name, /phase8 beta pasta/)
    assert.equal(repeated.items[0].name, first.items[0].name)
    assert.equal(repeated.source, 'llm')
  } finally {
    globalThis.fetch = originalFetch
    if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY
    else process.env.GROQ_API_KEY = originalGroqKey
  }
})

test('generated-menu cache isolates restaurant IDs and coordinates while reusing identical records', async () => {
  const originalFetch = globalThis.fetch
  const originalGroqKey = process.env.GROQ_API_KEY
  let fetchCalls = 0
  process.env.GROQ_API_KEY = 'stage1-test-only'
  globalThis.fetch = async () => {
    fetchCalls++
    return {
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              items: [{
                name: 'Mock Metadata Test Dish',
                description: 'Mock generated dish.',
                price: 15,
                prepTime: 20,
                rating: 4.5,
                tag: 'Test',
                dietary: [],
              }],
            }),
          },
        }],
      }),
    }
  }

  try {
    const name = `Stage 1 Metadata Key Test ${Date.now()}`
    const restaurant = { id: 'stable-restaurant-one', name, lat: 50.45, lng: 30.52 }
    const intent = {
      cleanQuery: 'phase8 restaurant metadata pasta',
      category: 'pasta',
      dietary: ['vegetarian'],
      maxBudget: 20,
    }

    const original = await generateMenuItems([restaurant], intent)
    const identical = await generateMenuItems([{ ...restaurant }], intent)
    assert.equal(fetchCalls, 1)
    assert.equal(identical.items[0].id, original.items[0].id)
    assert.equal(identical.items[0].lat, restaurant.lat)
    assert.equal(identical.items[0].lng, restaurant.lng)

    const differentId = await generateMenuItems([
      { ...restaurant, id: 'stable-restaurant-two' },
    ], intent)
    assert.equal(fetchCalls, 2)
    assert.match(differentId.items[0].id, /^stable-restaurant-two-item-/)

    const differentCoordinates = await generateMenuItems([
      { ...restaurant, lat: 50.46, lng: 30.53 },
    ], intent)
    assert.equal(fetchCalls, 3)
    assert.equal(differentCoordinates.items[0].lat, 50.46)
    assert.equal(differentCoordinates.items[0].lng, 30.53)
  } finally {
    globalThis.fetch = originalFetch
    if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY
    else process.env.GROQ_API_KEY = originalGroqKey
  }
})

test('SQLite menu-match cache keeps results separate for different limits', () => {
  const intent = {
    cleanQuery: 'phase8 pasta limit regression',
    category: 'pasta',
    dietary: [],
    maxBudget: null,
  }

  const oneItem = matchMenuItems(intent, 1)
  const moreItems = matchMenuItems(intent, 6)
  const repeatedOneItem = matchMenuItems(intent, 1)

  assert.equal(oneItem.items.length, 1)
  assert.ok(moreItems.items.length > oneItem.items.length)
  assert.equal(repeatedOneItem.items.length, 1)
})
