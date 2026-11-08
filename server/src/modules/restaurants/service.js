/**
 * Restaurant Geo-Search Service — Kyiv Oblast
 *
 * Strategy:
 * 1. Call Foursquare Places API (Places Search) — free tier, no billing card required.
 *    Searches within 50 km of the given point, filtered to food categories in Kyiv Oblast.
 * 2. Filter to venues that are currently open (open_now).
 * 3. Cache the full Places response for 5 minutes (TtlCache).
 * 4. If the Foursquare API key is absent or the call fails, fall back instantly to
 *    the local SQLite restaurant records (all marked as open, real Kyiv coords).
 *
 * Every restaurant entry returned always carries { lat, lng } so the client
 * can drop a map marker without any further processing.
 *
 * ─── Menu Matching ───────────────────────────────────────────────────────────
 * After we have a restaurant list we call matchMenuItems() which:
 *   a) Pulls all available menu_items from SQLite.
 *   b) Scores each item against the normalised query using term overlap +
 *      dietary-tag bonus + budget filter.
 *   c) Returns the top-N best matches, each carrying the parent restaurant's
 *      coordinates so the UI can link dish → pin.
 */

import { TtlCache } from '../../shared/cache/ttlCache.js'
import { SingleFlight } from '../../shared/cache/singleFlight.js'
import { listAvailableMenuItems } from '../../database/database.js'
import {
  countCache,
  measureProvider,
  recordSingleFlight,
  startTiming,
} from '../../shared/performanceMetrics.js'

// ─── Kyiv Oblast rough bounding box ──────────────────────────────────────────
const KYIV_OBLAST = {
  centerLat: 50.4501,  // Kyiv city centre
  centerLng: 30.5234,
  radiusMeters: 50_000, // 50 km — covers the city + near suburbs
}

// Foursquare food category IDs (top-level "Food" = 13000, covers all sub-categories)
const FSQ_FOOD_CATEGORY = '13000'

// ─── Caches ──────────────────────────────────────────────────────────────────
const geoCache = new TtlCache(5 * 60_000)   // 5-minute geo results
const menuCache = new TtlCache(60_000)        // 1-minute matched-menu results
const restaurantSearchSingleFlight = new SingleFlight()

// ─── Foursquare Places Search ─────────────────────────────────────────────────
async function fetchFoursquarePlaces(lat, lng, query = 'restaurant', metrics = null) {
  const apiKey = process.env.FOURSQUARE_API_KEY
  if (!apiKey) {
    if (metrics) await measureProvider(metrics, 'foursquare', false, async () => null)
    return null
  }

  const url = new URL('https://api.foursquare.com/v3/places/search')
  url.searchParams.set('ll', `${lat},${lng}`)
  url.searchParams.set('radius', String(KYIV_OBLAST.radiusMeters))
  url.searchParams.set('query', query)
  url.searchParams.set('categories', FSQ_FOOD_CATEGORY)
  url.searchParams.set('open_now', 'true')
  url.searchParams.set('limit', '20')
  url.searchParams.set('fields', 'fsq_id,name,geocodes,location,rating,hours')

  return measureProvider(metrics, 'foursquare', true, async () => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4_000)

    try {
      const res = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          Authorization: apiKey,
          Accept: 'application/json',
        },
      })
      if (!res.ok) return null
      const data = await res.json()
      return data.results ?? []
    } catch {
      return null
    } finally {
      clearTimeout(timeout)
    }
  })
}

// ─── Transform a Foursquare result to our internal restaurant shape ───────────
function placeToRestaurant(place) {
  return {
    id: place.fsq_id,
    name: place.name,
    lat: place.geocodes?.main?.latitude ?? KYIV_OBLAST.centerLat,
    lng: place.geocodes?.main?.longitude ?? KYIV_OBLAST.centerLng,
    rating: place.rating ? place.rating / 2 : 0,   // FSQ uses 0-10, normalise to 0-5
    isOpen: place.hours?.open_now ?? true,
    address: [place.location?.address, place.location?.locality].filter(Boolean).join(', '),
    source: 'foursquare',
  }
}

// ─── SQLite fallback restaurants ──────────────────────────────────────────────
// Coords and addresses come directly from the DB (seeded from menu.js).
function getSqliteRestaurants() {
  const items = listAvailableMenuItems()
  const seen = new Map()
  items.forEach((item) => {
    if (!seen.has(item.restaurant)) {
      seen.set(item.restaurant, {
        id: `local-${seen.size + 1}`,
        name: item.restaurant,
        lat: item.restaurantLat,
        lng: item.restaurantLng,
        rating: Number.parseFloat(item.rating) || 0,
        isOpen: true,
        address: item.restaurantAddress,
        source: 'local',
      })
    }
  })
  return [...seen.values()]
}

// ─── Public: search restaurants ───────────────────────────────────────────────
/**
 * Find open restaurants near a point in Kyiv Oblast.
 *
 * @param {{ lat?: number, lng?: number, keyword?: string }} options
 *   lat/lng default to Kyiv city centre when omitted.
 * @returns {Promise<{ restaurants: Restaurant[], source: 'google'|'local' }>}
 */
export async function searchRestaurants({ lat, lng, keyword } = {}, metrics = null) {
  const searchLat = typeof lat === 'number' ? lat : KYIV_OBLAST.centerLat
  const searchLng = typeof lng === 'number' ? lng : KYIV_OBLAST.centerLng
  const searchKeyword = keyword || 'restaurant'

  const cacheKey = `${searchLat.toFixed(3)},${searchLng.toFixed(3)},${searchKeyword}`
  const cached = geoCache.get(cacheKey)
  countCache(metrics, 'geoSearch', Boolean(cached))
  if (cached) return { ...cached, cached: true }

  const startedAt = metrics ? startTiming(metrics) : null
  const flight = restaurantSearchSingleFlight.runWithStatus(cacheKey, async () => {
    const places = await fetchFoursquarePlaces(searchLat, searchLng, searchKeyword, metrics)

    if (places !== null) {
      const restaurants = places.map(placeToRestaurant)

      const result = { restaurants, source: 'foursquare', cached: false }
      geoCache.set(cacheKey, result)
      return result
    }

    // ── Fallback: local SQLite ────────────────────────────────────────────────
    const restaurants = getSqliteRestaurants()
    const result = { restaurants, source: 'local', cached: false }
    geoCache.set(cacheKey, result)
    return result
  })

  let outcome = 'failure'
  try {
    const result = await flight.promise
    outcome = result.source === 'local' ? 'fallback' : 'success'
    return result
  } finally {
    recordSingleFlight(
      metrics,
      'restaurant_search',
      flight.joined ? 'joined' : 'started',
      startedAt,
      outcome,
    )
  }
}

// ─── Menu item matching ───────────────────────────────────────────────────────
/**
 * Match menu items against a normalised intent object.
 * Results are enriched with the restaurant's lat/lng for map markers.
 *
 * @param {{ cleanQuery: string, category: string, dietary: string[],
 *           maxBudget: number|null }} intent
 * @param {number} [limit=6]
 * @returns {{ items: MatchedItem[], markers: MapMarker[] }}
 */
export function matchMenuItems(intent, limit = 6, metrics = null) {
  const { cleanQuery = '', category = '', dietary = [], maxBudget = null } = intent

  const cacheKey = JSON.stringify([cleanQuery, category, dietary, maxBudget, limit])
  const cached = menuCache.get(cacheKey)
  countCache(metrics, 'matchedMenu', Boolean(cached))
  if (cached) return { ...cached, cached: true }

  // Build a restaurant → coord map from SQLite (always available)
  const restaurantCoords = new Map()
  getSqliteRestaurants().forEach((r) => restaurantCoords.set(r.name, { lat: r.lat, lng: r.lng }))

  const terms = `${cleanQuery} ${category}`.toLowerCase().split(/\s+/).filter((t) => t.length > 1)
  const dietarySet = new Set(dietary.map((d) => d.toLowerCase()))

  const scored = listAvailableMenuItems()
    .filter((item) => maxBudget === null || item.price <= maxBudget)
    .map((item) => {
      const searchable = `${item.name} ${item.description} ${item.restaurant} ${item.keywords.join(' ')}`.toLowerCase()

      // Term overlap score
      const termScore = terms.reduce((sum, t) => sum + (searchable.includes(t) ? 1 : 0), 0)

      // Dietary tag bonus
      const dietaryScore = [...dietarySet].reduce(
        (sum, tag) => sum + (item.keywords.some((k) => k.toLowerCase().includes(tag)) ? 2 : 0),
        0,
      )

      return { item, score: termScore + dietaryScore }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  // Build matched items with coords
  const items = scored.map(({ item }) => {
    const coords = restaurantCoords.get(item.restaurant) ?? { lat: KYIV_OBLAST.centerLat, lng: KYIV_OBLAST.centerLng }
    return {
      id: item.id,
      name: item.name,
      restaurant: item.restaurant,
      description: item.description,
      price: item.price,
      rating: item.rating,
      time: item.time,
      image: item.image,
      tag: item.tag,
      lat: coords.lat,
      lng: coords.lng,
    }
  })

  // Deduplicated map markers — one per restaurant that appears in results
  const markerMap = new Map()
  items.forEach((item) => {
    if (!markerMap.has(item.restaurant)) {
      markerMap.set(item.restaurant, { name: item.restaurant, lat: item.lat, lng: item.lng })
    }
  })
  const markers = [...markerMap.values()]

  const result = { items, markers, cached: false }
  menuCache.set(cacheKey, result)
  return result
}
