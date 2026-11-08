import { createHash } from 'node:crypto'

const itemsById = new Map()

export function registerGeneratedItems(items) {
  return items.map((item) => {
    const digest = createHash('sha256')
      .update(JSON.stringify([item.id, item.name, item.restaurant, item.price, item.description, item.lat, item.lng]))
      .digest('hex')
    const registered = { ...item, id: `generated-${digest}` }
    itemsById.set(registered.id, registered)
    return registered
  })
}

export function findGeneratedItem(id) {
  return itemsById.get(id)
}
