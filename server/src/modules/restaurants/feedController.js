import { createHash } from 'node:crypto'
import { listAvailableMenuItems } from '../../database/database.js'

export function createFeedEtag(items) {
  const digest = createHash('sha256').update(JSON.stringify(items)).digest('base64url')
  return `"${digest}"`
}

/**
 * GET /api/feed
 *
 * Lightweight polling endpoint — called by the frontend every 30 s.
 * Returns all currently available menu items with their restaurant coords,
 * plus an `updatedAt` ISO timestamp the client uses to skip re-renders
 * when nothing has changed.
 *
 * Supports If-None-Match / ETag so repeat polls with unchanged data get
 * a 304 Not Modified with zero body, saving bandwidth.
 */
export function getFeed(_request, response) {
  const items = listAvailableMenuItems().map((item) => ({
    id: item.id,
    name: item.name,
    restaurant: item.restaurant,
    address: item.restaurantAddress,
    description: item.description,
    price: item.price,
    rating: item.rating,
    time: item.time,
    image: item.image,
    tag: item.tag,
    lat: item.restaurantLat,
    lng: item.restaurantLng,
    keywords: item.keywords,
  }))

  const etag = createFeedEtag(items)

  response.setHeader('ETag', etag)
  response.setHeader('Cache-Control', 'no-cache')

  if (_request.headers['if-none-match'] === etag) {
    return response.status(304).end()
  }

  return response.json({
    items,
    updatedAt: new Date().toISOString(),
    total: items.length,
  })
}
