import crypto from 'node:crypto';
import { findMenuItem, findOrder, insertOrder } from '../../database/database.js'
<<<<<<< HEAD
=======
import { findGeneratedItem } from '../restaurants/runtimeMenu.js'
import { findRuntimeOrder, saveRuntimeOrder } from './runtimeOrders.js'
>>>>>>> 0ef0f656d58cf159f9148f5655e3a92243de1208
import { getOrderStatus } from "./helpers.js";

export const createOrder = (request, response) => {
  
  const PAYMENT_METHODS = new Set(['on_delivery', 'demo_card']);
<<<<<<< HEAD
  const { itemId, customerName, address, paymentMethod } = request.body || {}
  const item = findMenuItem(itemId)
  if (!item) return response.status(400).json({ error: 'Choose a dish from the menu.' })
=======
  const { itemId, itemIds, customerName, address, paymentMethod } = request.body || {}
  if (itemIds !== undefined && itemId !== undefined) {
    return response.status(400).json({ error: 'Choose either one dish or a list of dishes.' })
  }
  const ids = itemIds === undefined ? [itemId] : itemIds
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100 ||
      ids.some((id) => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length) {
    return response.status(400).json({ error: 'Choose between 1 and 100 distinct dishes from the menu.' })
  }
  const entries = ids.map((id) => {
    const generated = findGeneratedItem(id)
    return { item: generated ?? findMenuItem(id), generated: Boolean(generated) }
  })
  if (entries.some(({ item }) => !item)) return response.status(400).json({ error: 'Some selected dishes are no longer available. Remove them or search again.' })
  const item = entries[0].item
>>>>>>> 0ef0f656d58cf159f9148f5655e3a92243de1208
  if (typeof customerName !== 'string' || customerName.trim().length < 2 || customerName.trim().length > 80) {
    return response.status(400).json({ error: 'Enter a name between 2 and 80 characters.' })
  }
  if (typeof address !== 'string' || address.trim().length < 5 || address.trim().length > 240) {
    return response.status(400).json({ error: 'Enter an address between 5 and 240 characters.' })
  }
  if (!PAYMENT_METHODS.has(paymentMethod)) {
    return response.status(400).json({ error: 'Choose an available demo payment method.' })
  }

  const createdAt = Date.now()
<<<<<<< HEAD
  const trackingNumber = `SPN-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
=======
  let trackingNumber
  do {
    trackingNumber = `SPN-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
  } while (findRuntimeOrder(trackingNumber) || findOrder(trackingNumber))
>>>>>>> 0ef0f656d58cf159f9148f5655e3a92243de1208
  const order = {
    trackingNumber,
    customerName: customerName.trim(),
    address: address.trim(),
    paymentMethod,
    paymentStatus: 'not_processed',
    status: getOrderStatus(createdAt),
    item: {
      id: item.id,
      name: item.name,
      restaurant: item.restaurant,
      price: item.price,
    },
    createdAt: new Date(createdAt).toISOString(),
  }
<<<<<<< HEAD
  insertOrder({
    trackingNumber,
    customerName: order.customerName,
    address: order.address,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    status: order.status,
    restaurantId: item.restaurant_id,
    menuItemId: item.id,
    totalAmount: item.price,
    createdAt: order.createdAt,
    createdAtMs: createdAt,
  })
=======
  if (entries.length > 1) {
    order.items = entries.map(({ item }) => ({
      id: item.id,
      name: item.name,
      restaurant: item.restaurant,
      price: item.price,
    }))
    order.totalAmount = Math.round(order.items.reduce((sum, entry) => sum + entry.price, 0) * 100) / 100
  }
  if (entries.length > 1 || entries[0].generated) {
    saveRuntimeOrder({ ...order, createdAtMs: createdAt })
  } else {
    insertOrder({
      trackingNumber,
      customerName: order.customerName,
      address: order.address,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      status: order.status,
      restaurantId: item.restaurant_id,
      menuItemId: item.id,
      totalAmount: item.price,
      createdAt: order.createdAt,
      createdAtMs: createdAt,
    })
  }
>>>>>>> 0ef0f656d58cf159f9148f5655e3a92243de1208

  return response.status(201).json({ order })
}

export const getStatus=(request, response) => {
<<<<<<< HEAD
=======
    const runtimeOrder = findRuntimeOrder(request.params.trackingNumber)
    if (runtimeOrder) {
      const { createdAtMs, ...order } = runtimeOrder
      return response.json({ order: { ...order, status: getOrderStatus(createdAtMs) }, demo: true })
    }
>>>>>>> 0ef0f656d58cf159f9148f5655e3a92243de1208
    const storedOrder = findOrder(request.params.trackingNumber);
    if (!storedOrder) return response.status(404).json({ error: 'No order found with that tracking number.' });
    const { createdAtMs, itemId, itemName, itemRestaurant, itemPrice, ...publicOrder } = storedOrder;
    return response.json({
      order: {
        ...publicOrder,
        status: getOrderStatus(createdAtMs),
        item: { id: itemId, name: itemName, restaurant: itemRestaurant, price: itemPrice },
      },
      demo: true,
    });
  };