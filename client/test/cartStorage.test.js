import test from 'node:test'
import assert from 'node:assert/strict'
import { CART_STORAGE_KEY, readCart, writeCart } from '../src/app/context/cartStorage.js'

function createStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('cart items survive a storage round trip, including empty carts', () => {
  const storage = createStorage()
  const items = [
    { id: 'mushroom-pasta', name: 'Pasta', restaurant: 'Restaurant', price: 14.9 },
    { id: 'generated-123', name: 'Pizza', restaurant: 'Restaurant', price: 12, image: 'photo-test' },
  ]
  assert.deepEqual(readCart(storage), [])
  writeCart(storage, items)
  assert.deepEqual(readCart(storage), items)
  writeCart(storage, [items[1]])
  assert.deepEqual(readCart(storage), [items[1]])
  writeCart(storage, [])
  assert.deepEqual(readCart(storage), [])
})

test('corrupt, malformed and duplicate saved entries are rejected', () => {
  const storage = createStorage()
  const valid = { id: 'x', name: 'Food', restaurant: 'Restaurant', price: 10 }
  for (const raw of ['{', '{}', JSON.stringify([null]), JSON.stringify([{ ...valid, price: '10' }]), JSON.stringify([valid, valid])]) {
    storage.setItem(CART_STORAGE_KEY, raw)
    assert.throws(() => readCart(storage))
  }
})

test('storage access failures are surfaced', () => {
  const storage = {
    getItem() { throw new Error('read blocked') },
    setItem() { throw new Error('write blocked') },
  }
  assert.throws(() => readCart(storage), /read blocked/)
  assert.throws(() => writeCart(storage, []), /write blocked/)
})
