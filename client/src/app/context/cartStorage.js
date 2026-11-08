export const CART_STORAGE_KEY = 'spoon.cart.v1'

export function readCart(storage) {
  const raw = storage.getItem(CART_STORAGE_KEY)
  if (raw === null) return []

  const items = JSON.parse(raw)
  if (!Array.isArray(items) || items.some((item) =>
    !item || typeof item !== 'object' ||
    typeof item.id !== 'string' || !item.id.trim() ||
    typeof item.name !== 'string' || typeof item.restaurant !== 'string' ||
    typeof item.price !== 'number' || !Number.isFinite(item.price) || item.price < 0
  ) || new Set(items.map((item) => item.id)).size !== items.length) {
    throw new Error('Invalid saved cart')
  }
  return items
}

export function writeCart(storage, items) {
  storage.setItem(CART_STORAGE_KEY, JSON.stringify(items))
}
