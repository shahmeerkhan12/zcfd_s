import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { foodTerms } from '../src/shared/foodDictionary.js'
import { createApp } from '../src/index.js'

let server
let url

before(async () => {
  server = createApp().listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  url = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
})

test('recognizes food terms in multiple languages without substring false positives', () => {
  for (const query of ['pizza please', 'хочу пиццу', 'хочу піцу', 'курку з рисом', 'Something spicy', 'A meat-free dinner']) {
    assert.ok(foodTerms(query).length, query)
  }
  for (const query of ['car', 'машина', 'автомобіль', 'pizzazz', 'carpet', 'notebook']) {
    assert.deepEqual(foodTerms(query), [], query)
  }
})

test('both suggestion endpoints return no items for non-food input without calling providers', async () => {
  const originalFetch = globalThis.fetch
  let providerCalls = 0
  globalThis.fetch = async (...args) => {
    providerCalls++
    throw new Error(`Unexpected provider request to ${args[0]}`)
  }
  try {
    for (const path of ['/api/restaurants', '/api/suggestions']) {
      for (const query of ['машина', 'carpet']) {
        const response = await originalFetch(`${url}${path}?q=${encodeURIComponent(query)}`)
        assert.equal(response.status, 200)
        assert.deepEqual((await response.json()).items, [])
      }
    }
    assert.equal(providerCalls, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('food query with no matching menu returns no arbitrary dishes', async () => {
  const response = await fetch(`${url}/api/suggestions?q=${encodeURIComponent('dessert')}`)
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).items, [])
})

test('dictionary aliases preserve menu matching', async () => {
  const response = await fetch(`${url}/api/suggestions?q=${encodeURIComponent('піцу')}`)
  const { items } = await response.json()
  assert.equal(response.status, 200)
  assert.ok(items.some((item) => item.name.toLowerCase().includes('pizza')))
})
