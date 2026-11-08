const orders = new Map()

export function saveRuntimeOrder(order) {
  orders.set(order.trackingNumber, order)
}

export function findRuntimeOrder(trackingNumber) {
  return orders.get(trackingNumber)
}
