/**
 * LLM Service — Input Validation & Normalization
 *
 * Accepts raw user text that may contain:
 *   - Typos / misspellings  ("chiken currry")
 *   - Mojibake / garbled encoding  ("Ð¡ÑƒÑˆÑ–")
 *   - Wrong keyboard layout  ("учша" typed on a UA keyboard while in EN mode)
 *
 * Returns a clean, English-language food search query and a structured
 * intent object (category, budget, dietary tags, speed preference).
 *
 * Provider priority:
 *   1. Groq (GROQ_API_KEY)          — free, ~200 ms, openai/gpt-oss-20b
 *   2. Gemini Flash (GEMINI_API_KEY) — free, Google AI Studio, gemini-2.0-flash
 *   3. OpenAI (OPENAI_API_KEY)       — gpt-4o-mini
 *   4. Regex fallback                — always works, no API key needed
 */

import { TtlCache } from '../../shared/cache/ttlCache.js'
import { foodTerms } from '../../shared/foodDictionary.js'
import { SingleFlight } from '../../shared/cache/singleFlight.js'
import {
  countCache,
  measureProvider,
  recordSingleFlight,
  startTiming,
} from '../../shared/performanceMetrics.js'

// ─── Cache: 60 s TTL so repeated identical noisy queries don't hit the API ───
const normalizeCache = new TtlCache(60_000)
const normalizeSingleFlight = new SingleFlight()

// ─── JSON schema that OpenAI must return (Structured Outputs) ─────────────────
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    cleanQuery: {
      type: 'string',
      description: 'Corrected, readable English food search query.',
    },
    category: {
      type: 'string',
      description: 'Food category inferred from the query, e.g. "burger", "pizza", "soup".',
    },
    dietary: {
      type: 'array',
      items: { type: 'string' },
      description: 'Dietary tags, e.g. ["vegetarian", "vegan", "spicy"].',
    },
    maxBudget: {
      type: ['number', 'null'],
      description: 'Maximum price in USD the user mentioned, or null.',
    },
    speedPriority: {
      type: 'boolean',
      description: 'True when the user wants the fastest available option.',
    },
  },
  required: ['cleanQuery', 'category', 'dietary', 'maxBudget', 'speedPriority'],
  additionalProperties: false,
}

const SYSTEM_PROMPT = `You are an input-normalization assistant for a food-delivery app.

The user's text may be:
1. Misspelled or contain typos.
2. Garbled / mojibake (malformed Unicode that looks like "Ð¡ÑƒÑˆÑ–").
3. Typed on the wrong keyboard layout (Ukrainian/Russian Cyrillic typed while the
   OS was set to English, or vice-versa — e.g. "учша" → "sushi").

Your job:
- Detect the actual intended food item regardless of encoding or layout errors.
- Produce a clean, natural English search query in "cleanQuery".
- Extract structured intent fields as defined in the JSON schema.
- NEVER invent food items — if the input is truly unintelligible, set cleanQuery to "".
- Respond ONLY with valid JSON matching the provided schema. No extra text.`

// ─── Regex-based fallback ──────────────────────────────────────────────────────
function regexNormalize(raw) {
  // Strip non-ASCII garbage (common in mojibake), collapse whitespace
  const clean = raw
    .replace(/[^\x20-\x7E\u00C0-\u024F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const lower = clean.toLowerCase()

  // Simple budget extraction  "$12"  /  "under 15"
  const budgetMatch = lower.match(/(?:under|<|max)?\s*\$?\s*(\d+(?:\.\d+)?)\s*(?:dollars?|usd|\$)?/)
  const maxBudget = budgetMatch ? Number.parseFloat(budgetMatch[1]) : null

  const speedWords = ['fast', 'quick', 'asap', 'now', 'immediately', 'rush', 'urgent']
  const speedPriority = speedWords.some((w) => lower.includes(w))

  const dietaryTags = []
  if (/\bvegan\b/.test(lower)) dietaryTags.push('vegan')
  if (/\bvegetarian\b/.test(lower)) dietaryTags.push('vegetarian')
  if (/\bspicy\b/.test(lower)) dietaryTags.push('spicy')
  if (/\bgluten.?free\b/.test(lower)) dietaryTags.push('gluten-free')

  // Best-effort category — first recognisable food word wins
  const categories = [
    'burger', 'pizza', 'pasta', 'sushi', 'ramen', 'curry', 'soup', 'salad',
    'bowl', 'sandwich', 'wrap', 'steak', 'chicken', 'fish', 'seafood', 'tacos',
  ]
  const category = categories.find((c) => lower.includes(c)) ?? foodTerms(raw)[0] ?? 'food'

  const translatedTerms = foodTerms(raw).join(' ')
  return { cleanQuery: [clean, translatedTerms].filter(Boolean).join(' '), category, dietary: dietaryTags, maxBudget, speedPriority }
}

// ─── Shared JSON chat completion helper ──────────────────────────────────────
async function callJsonLLM(baseUrl, apiKey, model, rawText) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3_500)

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT +
              '\n\nYou MUST respond with a JSON object containing exactly these keys: ' +
              'cleanQuery (string), category (string), dietary (array of strings), ' +
              'maxBudget (number or null), speedPriority (boolean). No other text.',
          },
          { role: 'user', content: rawText },
        ],
      }),
    })

    if (!res.ok) return null
    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    if (!content) return null
    return JSON.parse(content)
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

// ─── Provider calls ───────────────────────────────────────────────────────────

async function callGroq(rawText) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return null
  // openai/gpt-oss-20b: available on Groq free tier, supports json_object mode
  return callJsonLLM('https://api.groq.com/openai/v1', apiKey, 'openai/gpt-oss-20b', rawText)
}

/**
 * Gemini Flash via the OpenAI-compatible endpoint Google exposes.
 * Model: gemini-2.0-flash  (free tier — 1500 req/day, no card needed)
 * Get key: https://aistudio.google.com/apikey
 */
async function callGemini(rawText) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3_500)

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generationConfig: { responseMimeType: 'application/json' },
          contents: [
            {
              parts: [
                {
                  text:
                    SYSTEM_PROMPT +
                    '\n\nYou MUST respond with a JSON object containing exactly these keys: ' +
                    'cleanQuery (string), category (string), dietary (array of strings), ' +
                    'maxBudget (number or null), speedPriority (boolean). No other text.\n\n' +
                    'User input: ' + rawText,
                },
              ],
            },
          ],
        }),
      },
    )

    if (!res.ok) return null
    const data = await res.json()
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!content) return null
    return JSON.parse(content)
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

async function callOpenAI(rawText) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  return callJsonLLM('https://api.openai.com/v1', apiKey, 'gpt-4o-mini', rawText)
}

// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * Normalize and validate a raw user query.
 * @param {string} rawText
 * @returns {Promise<{ cleanQuery: string, category: string, dietary: string[],
 *                     maxBudget: number|null, speedPriority: boolean,
 *                     source: 'llm'|'fallback' }>}
 */
export async function normalizeQuery(rawText, metrics = null) {
  const cacheKey = rawText
  const cached = normalizeCache.get(cacheKey)
  countCache(metrics, 'normalization', Boolean(cached))
  if (cached) return { ...cached, cached: true }

  const startedAt = metrics ? startTiming(metrics) : null
  const flight = normalizeSingleFlight.runWithStatus(cacheKey, async () => {
    // Try providers in order: Groq → Gemini Flash → OpenAI → regex fallback
    const llmResult =
      (await measureProvider(metrics, 'groq', Boolean(process.env.GROQ_API_KEY), () => callGroq(rawText))) ??
      (await measureProvider(metrics, 'gemini', Boolean(process.env.GEMINI_API_KEY), () => callGemini(rawText))) ??
      (await measureProvider(metrics, 'openai', Boolean(process.env.OPENAI_API_KEY), () => callOpenAI(rawText)))
    const source = llmResult ? 'llm' : 'fallback'
    const result = { ...(llmResult ?? regexNormalize(rawText)), source, cached: false }

    normalizeCache.set(cacheKey, result)
    return result
  })

  let outcome = 'failure'
  try {
    const result = await flight.promise
    outcome = result.source === 'fallback' ? 'fallback' : 'success'
    return result
  } finally {
    recordSingleFlight(
      metrics,
      'normalization',
      flight.joined ? 'joined' : 'started',
      startedAt,
      outcome,
    )
  }
}
