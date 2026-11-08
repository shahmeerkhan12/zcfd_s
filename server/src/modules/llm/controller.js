import { normalizeQuery } from './service.js'

/**
 * POST /api/llm/normalize
 * Body: { "text": "<raw user input>" }
 *
 * Returns the cleaned query + structured intent, plus whether the result
 * came from the LLM or the regex fallback.
 */
export async function normalize(request, response) {
  const text = typeof request.body?.text === 'string' ? request.body.text.trim() : ''

  if (!text) {
    return response.status(400).json({ error: 'Provide a non-empty "text" field.' })
  }
  if (text.length > 500) {
    return response.status(400).json({ error: 'Input must be 500 characters or fewer.' })
  }

  const result = await normalizeQuery(text)
  return response.json(result)
}
