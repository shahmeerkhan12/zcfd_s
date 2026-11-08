/**
 * LLM Menu Generator
 *
 * Given a list of restaurants (from geo-search) and a normalised user intent,
 * asks Groq to generate realistic menu items for each venue tailored to the
 * user's request. This means every restaurant discovered around Kyiv gets a
 * unique, contextually-relevant menu — no hardcoded data needed.
 *
 * Caching strategy:
 *   - Key: "{restaurantName}|{category}|{dietary}|{maxBudget}"
 *   - TTL: 10 minutes — menus don't change during a demo session
 *
 * Fallback: if Groq is unavailable, falls back to SQLite menu matching.
 */

import { TtlCache } from '../../shared/cache/ttlCache.js'
import { SingleFlight } from '../../shared/cache/singleFlight.js'
import {
  groqMenuGenerationLimiter,
  QueueFullError,
  QueueTimeoutError,
} from '../../shared/concurrencyLimiter.js'
import {
  countCache,
  measureProvider,
  recordProviderQueue,
  recordProviderQueueOutcome,
  recordSingleFlight,
  recordRestaurantCall,
  startTiming,
} from '../../shared/performanceMetrics.js'

// Cache generated menus for 10 minutes per restaurant+intent combo
const generatedMenuCache = new TtlCache(10 * 60_000)
const menuGenerationSingleFlight = new SingleFlight()

// Unsplash photo IDs mapped to food categories — used for realistic images
const CATEGORY_PHOTOS = {
  burger:     ['photo-1568901346375-23c9450c58cd', 'photo-1565299507177-b0ac66763828', 'photo-1550547660-d9450f859349'],
  pizza:      ['photo-1513104890138-7c749659a591', 'photo-1565299624946-b28f40a0ae38', 'photo-1574071318508-1cdbab80d002', 'photo-1593560708920-61dd98c46a4e'],
  pasta:      ['photo-1473093295043-cdd812d0e601', 'photo-1621996346565-e3dbc646d9a9', 'photo-1551183053-bf91a1d81141'],
  sushi:      ['photo-1579871494447-9811cf80d66c', 'photo-1553621042-f6e147245754', 'photo-1579584425555-c3ce17fd4351'],
  ramen:      ['photo-1569718212165-3a8278d5f624', 'photo-1612927601601-6638404737ce', 'photo-1623341214825-9f4f963727da'],
  curry:      ['photo-1603894584373-5ac82b2ae398', 'photo-1708782344490-9026aaa5eec7', 'photo-1585937421612-70a008356fbe'],
  soup:       ['photo-1547592180-85f173990554', 'photo-1476718406336-bb5a9690ee2a', 'photo-1547592166-23ac45744acd'],
  salad:      ['photo-1512621776951-a57141f2eefd', 'photo-1546069901-ba9599a7e63c', 'photo-1607532941433-304659e8198a'],
  bowl:       ['photo-1512621776951-a57141f2eefd', 'photo-1546069901-ba9599a7e63c', 'photo-1511690656952-34342bb7c2f2'],
  steak:      ['photo-1546964124-0cce460f38ef', 'photo-1588168333986-5078d3ae3976', 'photo-1600891964092-4316c288032e'],
  chicken:    ['photo-1606755962773-d324e0a13086', 'photo-1606728035253-49e8a23146de', 'photo-1602534923950-d2c7e6be0ca0'],
  fish:       ['photo-1467003909585-2f8a72700288', 'photo-1510130387422-82bed34b37e9', 'photo-1519708227418-c8fd9a32b7a2'],
  seafood:    ['photo-1563379926898-05f4575a45d8', 'photo-1559737558-2f5a35f4523b', 'photo-1579783411296-c908953b2dcd'],
  sandwich:   ['photo-1509722747041-616f39b57569', 'photo-1553909489-cd47e0907980', 'photo-1528735602780-2552fd46c7af'],
  wrap:       ['photo-1626700051175-6818013e1d4f', 'photo-1646530208887-8a791bff4701', 'photo-1562059390-a761a084768e'],
  kebab:      ['photo-1504674900247-0877df9cc836', 'photo-1555939594-58d7cb561ad1', 'photo-1603360946369-dc9bb6258143'],
  default:    ['photo-1504674900247-0877df9cc836', 'photo-1546069901-ba9599a7e63c', 'photo-1600891964092-4316c288032e'],
}

// Prefer dish formats over their fillings (for example, "chicken wrap" should
// use the wrap photo). Ingredient-only names still use the matching category.
const PHOTO_KEYWORD_PRIORITY = [
  'burger', 'pizza', 'pasta', 'sushi', 'ramen', 'curry', 'soup', 'salad',
  'bowl', 'sandwich', 'wrap', 'kebab', 'steak', 'chicken', 'fish', 'seafood',
]

/** Return the photo category for a dish name or category, without applying default. */
function photoKeyForName(text = '') {
  const lower = text.toLowerCase()
  return PHOTO_KEYWORD_PRIORITY.find((key) => lower.includes(key)) ?? null
}

// ─── Groq LLM call ────────────────────────────────────────────────────────────
async function generateMenuViaGroq(restaurant, intent) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return null

  const { cleanQuery, category, dietary = [], maxBudget } = intent

  const budgetHint = maxBudget ? `Max price per item: $${maxBudget}.` : 'No price limit.'
  const dietaryHint = dietary.length ? `Dietary requirements: ${dietary.join(', ')}.` : ''

  const prompt = `You are a menu generator for a food delivery app.
Generate exactly 3 menu items for a restaurant called "${restaurant.name}" located in Kyiv, Ukraine.
The user is looking for: "${cleanQuery || category}".
${budgetHint} ${dietaryHint}
Cuisine style: infer from restaurant name.

Return a JSON object with key "items" containing an array of exactly 3 objects, each with:
- id: unique slug (lowercase, hyphens, include restaurant slug and item name, e.g. "tokyo-house-spicy-ramen")
- name: dish name (realistic, specific)
- description: one sentence, appetising, mention 2-3 key ingredients
- price: number in USD (realistic for Kyiv, between 8 and 28)
- prepTime: integer minutes (10-40)
- rating: number between 4.2 and 5.0
- tag: short label like "Chef's pick", "Most popular", "New", "Spicy", "Vegan"
- dietary: array of applicable tags from ["vegan","vegetarian","spicy","gluten-free","seafood","meat"]`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4_000)

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        temperature: 0.7,          // slight creativity so menus differ between restaurants
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a menu generator. Respond only with valid JSON.' },
          { role: 'user', content: prompt },
        ],
      }),
    })

    if (!res.ok) return null
    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    if (!content) return null

    const parsed = JSON.parse(content)
    const items = Array.isArray(parsed.items) ? parsed.items : null
    if (!items || items.length === 0) return null

    // Enrich each item with restaurant coords + photo
    return items.map((item) => ({
      id: item.id ?? `${restaurant.id}-item-${Math.random().toString(36).slice(2, 7)}`,
      name: item.name,
      restaurant: restaurant.name,
      description: item.description,
      price: Number(item.price) || 12,
      rating: String(item.rating ?? '4.5'),
      time: `${item.prepTime ?? 20}–${(item.prepTime ?? 20) + 10} min`,
      tag: item.tag ?? 'Popular',
      dietary: item.dietary ?? [],
      lat: restaurant.lat,
      lng: restaurant.lng,
    }))
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * Generate menu items for a list of restaurants using the LLM.
 * Runs all restaurants in parallel, caches results per restaurant+intent.
 *
 * @param {Restaurant[]} restaurants  — from geo-search
 * @param {object}       intent       — from normalizeQuery()
 * @param {number}       [limit=6]    — max total items to return
 * @returns {Promise<{ items: MenuItem[], markers: MapMarker[], source: 'llm'|'fallback' }>}
 */
export async function generateMenuItems(restaurants, intent, limit = 6, metrics = null) {
  const { cleanQuery = '', category = '', dietary = [], maxBudget = null } = intent

  // Generate menus for up to 4 restaurants in parallel
  const targets = restaurants.slice(0, 4)

  const results = await Promise.all(
    targets.map(async (restaurant, index) => {
      const startedAt = startTiming(metrics)
      let outcome = 'exception'
      const cacheKey = JSON.stringify([
        restaurant.id,
        restaurant.name,
        restaurant.lat,
        restaurant.lng,
        category,
        dietary,
        maxBudget,
        cleanQuery,
      ])
      const cached = generatedMenuCache.get(cacheKey)
      countCache(metrics, 'generatedMenu', Boolean(cached))
      if (cached) {
        outcome = 'cache_hit'
        recordRestaurantCall(metrics, index, startedAt, outcome)
        return cached
      }

      const flightStartedAt = metrics ? startTiming(metrics) : null
      const flight = menuGenerationSingleFlight.runWithStatus(cacheKey, async () => {
        const configured = Boolean(process.env.GROQ_API_KEY)
        const operation = () => measureProvider(
          metrics,
          'groq_menu',
          configured,
          () => generateMenuViaGroq(restaurant, intent),
          index,
        )
        let generated
        if (configured) {
          try {
            generated = await groqMenuGenerationLimiter.run(
              operation,
              metrics
                ? ({ queueWaitMs, queueLength }) =>
                  recordProviderQueue(metrics, 'groq_menu', queueWaitMs, queueLength)
                : null,
            )
          } catch (error) {
            if (error instanceof QueueFullError || error instanceof QueueTimeoutError) {
              recordProviderQueueOutcome(
                metrics,
                'groq_menu',
                error instanceof QueueFullError ? 'queue_rejected' : 'queue_timeout',
                error.queueWaitMs,
                error.queueDepth,
              )
              return null
            }
            throw error
          }
        } else {
          generated = await operation()
        }

        if (generated) generatedMenuCache.set(cacheKey, generated)
        return generated
      })

      let flightOutcome = 'failure'
      try {
        const items = await flight.promise
        if (items) {
          outcome = 'generated'
          flightOutcome = 'success'
          return items
        }
        outcome = process.env.GROQ_API_KEY ? 'no_result' : 'skipped_unconfigured'
        flightOutcome = 'fallback'
        return null
      } finally {
        recordSingleFlight(
          metrics,
          'menu_generation',
          flight.joined ? 'joined' : 'started',
          flightStartedAt,
          flightOutcome,
        )
        if (!flight.joined) recordRestaurantCall(metrics, index, startedAt, outcome)
      }
    }),
  )

  // Flatten, filter budget, keep top items
  const allItems = results
    .filter(Boolean)
    .flat()
    .filter((item) => maxBudget === null || item.price <= maxBudget)
    .slice(0, limit)

  if (allItems.length === 0) return null  // signal caller to use fallback

  const photoIndexes = new Map()
  const itemsWithPhotos = allItems.map((item) => {
    const key = photoKeyForName(item.name) ?? photoKeyForName(category) ?? 'default'
    const photos = CATEGORY_PHOTOS[key]
    const index = photoIndexes.get(key) ?? 0
    photoIndexes.set(key, index + 1)
    return { ...item, image: photos[index % photos.length] }
  })

  // Deduplicated map markers
  const markerMap = new Map()
  itemsWithPhotos.forEach((item) => {
    if (!markerMap.has(item.restaurant)) {
      markerMap.set(item.restaurant, { name: item.restaurant, lat: item.lat, lng: item.lng })
    }
  })

  return {
    items: itemsWithPhotos,
    markers: [...markerMap.values()],
    source: 'llm',
  }
}
