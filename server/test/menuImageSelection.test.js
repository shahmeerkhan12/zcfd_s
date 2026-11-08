import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateMenuItems } from '../src/modules/restaurants/menuGenerator.js'
import { menu } from '../data-mock/menu.js'

async function generateMockedMenu({ dishName, category, caseName }) {
  const originalFetch = globalThis.fetch
  const originalGroqKey = process.env.GROQ_API_KEY
  let fetchCalls = 0
  process.env.GROQ_API_KEY = 'menu-image-regression-test-only'

  globalThis.fetch = async (url, options) => {
    fetchCalls++
    assert.match(String(url), /api\.groq\.com\/openai\/v1\/chat\/completions$/)
    const request = JSON.parse(options.body)
    const prompt = request.messages[1].content
    assert.ok(prompt.includes(`The user is looking for: "${caseName}"`))

    return {
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              items: [{
                id: `menu-image-${caseName}`,
                name: dishName,
                description: 'Mocked image-selection regression dish.',
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
    const restaurant = {
      id: `menu-image-${caseName}`,
      name: `Menu Image Regression ${caseName}`,
      lat: 50.45,
      lng: 30.52,
    }
    const result = await generateMenuItems([restaurant], {
      cleanQuery: caseName,
      category,
      dietary: [],
      maxBudget: null,
    })

    assert.equal(fetchCalls, 1)
    assert.equal(result?.source, 'llm')
    assert.equal(result?.items[0]?.name, dishName)
    return result.items[0].image
  } finally {
    globalThis.fetch = originalFetch
    if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY
    else process.env.GROQ_API_KEY = originalGroqKey
  }
}

test('dish-name keyword takes priority over the broader category', async () => {
  const image = await generateMockedMenu({
    dishName: 'Chicken Wrap',
    category: 'chicken',
    caseName: `menu-image-wrap-${Date.now()}-${Math.random()}`,
  })

  assert.equal(image, 'photo-1626700051175-6818013e1d4f')
})

test('category image is used when the dish name has no mapped keyword', async () => {
  const image = await generateMockedMenu({
    dishName: 'Chef Tasting Plate',
    category: 'sushi',
    caseName: `menu-image-category-${Date.now()}-${Math.random()}`,
  })

  assert.equal(image, 'photo-1579871494447-9811cf80d66c')
})

test('default image is used when neither dish name nor category matches', async () => {
  const image = await generateMockedMenu({
    dishName: 'Chef Tasting Plate',
    category: 'comfort food',
    caseName: `menu-image-default-${Date.now()}-${Math.random()}`,
  })

  assert.equal(image, 'photo-1504674900247-0877df9cc836')
})

test('kebab image is consistent in generated and seeded menus', async () => {
  const image = await generateMockedMenu({
    dishName: 'Lamb Kebab Platter',
    category: 'kebab',
    caseName: `menu-image-kebab-${Date.now()}-${Math.random()}`,
  })

  assert.equal(image, 'photo-1504674900247-0877df9cc836')
  assert.equal(menu.find((item) => item.id === 'lamb-kebab')?.image, image)
})

test('pizza photos vary across restaurants and remain stable on cache hits', async () => {
  const originalFetch = globalThis.fetch
  const originalGroqKey = process.env.GROQ_API_KEY
  let fetchCalls = 0
  process.env.GROQ_API_KEY = 'menu-image-regression-test-only'
  globalThis.fetch = async () => {
    fetchCalls++
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({
          items: ['Margherita Pizza', 'Cheese Pizza', 'Mushroom Pizza'].map((name) => ({
            name, price: 15, prepTime: 20,
          })),
        }) } }],
      }),
    }
  }
  try {
    const restaurants = [
      { id: 'photo-pizza-one', name: 'Photo Pizza One', lat: 50.45, lng: 30.52 },
      { id: 'photo-pizza-two', name: 'Photo Pizza Two', lat: 50.46, lng: 30.53 },
    ]
    const intent = { cleanQuery: 'photo variety pizza', category: 'pizza', dietary: [], maxBudget: null }
    const first = await generateMenuItems(restaurants, intent)
    const repeated = await generateMenuItems(restaurants, intent)
    assert.equal(fetchCalls, 2)
    assert.equal(first.items.length, 6)
    assert.equal(new Set(first.items.slice(0, 4).map((item) => item.image)).size, 4)
    assert.deepEqual(repeated.items.map((item) => item.image), first.items.map((item) => item.image))
  } finally {
    globalThis.fetch = originalFetch
    if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY
    else process.env.GROQ_API_KEY = originalGroqKey
  }
})

test('every category rotates at least three photos without extra provider requests', async () => {
  const categories = [
    'burger', 'pizza', 'pasta', 'sushi', 'ramen', 'curry', 'soup', 'salad',
    'bowl', 'sandwich', 'wrap', 'kebab', 'steak', 'chicken', 'fish', 'seafood', 'unmapped',
  ]
  const originalFetch = globalThis.fetch
  const originalGroqKey = process.env.GROQ_API_KEY
  let fetchCalls = 0
  process.env.GROQ_API_KEY = 'menu-image-regression-test-only'
  globalThis.fetch = async () => {
    fetchCalls++
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({
          items: Array.from({ length: 4 }, (_, index) => ({
            id: `item-${index}`, name: 'Chef Tasting Plate', price: 15, prepTime: 20,
          })),
        }) } }],
      }),
    }
  }

  try {
    for (const category of categories) {
      const restaurant = { id: `photo-${category}`, name: `Photo ${category}`, lat: 50.45, lng: 30.52 }
      const intent = { cleanQuery: `photo variety ${category}`, category, dietary: [], maxBudget: null }
      const first = await generateMenuItems([restaurant], intent)
      const repeated = await generateMenuItems([restaurant], intent)
      const photos = first.items.map((item) => item.image)
      assert.equal(new Set(photos.slice(0, 3)).size, 3, category)
      if (category !== 'pizza') assert.equal(photos[3], photos[0], category)
      assert.deepEqual(repeated.items.map((item) => item.image), photos, category)
    }
    assert.equal(fetchCalls, categories.length)
  } finally {
    globalThis.fetch = originalFetch
    if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY
    else process.env.GROQ_API_KEY = originalGroqKey
  }
})
