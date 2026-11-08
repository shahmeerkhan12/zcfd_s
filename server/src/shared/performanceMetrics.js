import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'

const ENABLED = process.env.PERF_METRICS === '1'

function safely(record) {
  try {
    record()
  } catch {
    // Metrics must never affect application behavior.
  }
}

export function startPerfTrace(_request, response) {
  if (!ENABLED) return null

  try {
    const trace = {
      requestId: randomUUID(),
      startedAt: performance.now(),
      stagesMs: {},
      providerCalls: [],
      providerQueue: [],
      singleFlight: [],
      restaurantCalls: [],
      cache: {},
    }

    response.once('finish', () => {
      safely(() => {
        console.info(JSON.stringify({
          event: 'food_delivery_perf',
          requestId: trace.requestId,
          statusCode: response.statusCode,
          // Server-side time until Node emits response finish; this does not
          // measure when the client has received or rendered the response.
          responseFinishMs: performance.now() - trace.startedAt,
          stagesMs: trace.stagesMs,
          providerCalls: trace.providerCalls,
          providerQueue: trace.providerQueue,
          singleFlight: trace.singleFlight,
          restaurantCalls: trace.restaurantCalls,
          cache: trace.cache,
        }))
      })
    })

    return trace
  } catch {
    return null
  }
}

export function measureStage(trace, name, operation) {
  if (!trace) return operation()

  let startedAt
  try {
    startedAt = performance.now()
  } catch {
    return operation()
  }

  const finish = () => safely(() => { trace.stagesMs[name] = performance.now() - startedAt })
  try {
    const result = operation()
    if (result && typeof result.then === 'function') return result.finally(finish)
    finish()
    return result
  } catch (error) {
    finish()
    throw error
  }
}

export function measureProvider(trace, provider, configured, operation, restaurantIndex = null) {
  if (!trace) return operation()
  if (!configured) {
    safely(() => trace.providerCalls.push({
      provider,
      ...(restaurantIndex === null ? {} : { restaurantIndex }),
      executed: false,
      outcome: 'skipped_unconfigured',
    }))
    return operation()
  }

  let startedAt
  try {
    startedAt = performance.now()
  } catch {
    return operation()
  }

  let outcome = 'exception'
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    safely(() => trace.providerCalls.push({
      provider,
      ...(restaurantIndex === null ? {} : { restaurantIndex }),
      executed: true,
      durationMs: performance.now() - startedAt,
      outcome,
    }))
  }

  let result
  try {
    result = operation()
  } catch (error) {
    finish()
    throw error
  }

  if (result && typeof result.then === 'function') {
    return result.then((value) => {
      // Provider helpers return null when a configured call fails or yields no
      // usable result; they intentionally keep response bodies private.
      outcome = value === null ? 'no_result' : 'success'
      return value
    }, (error) => {
      outcome = 'exception'
      throw error
    }).finally(finish)
  }

  outcome = result === null ? 'no_result' : 'success'
  finish()
  return result
}

export function startTiming(trace) {
  if (!trace) return null
  try {
    return performance.now()
  } catch {
    return null
  }
}

export function countCache(trace, cacheName, hit) {
  if (!trace) return
  safely(() => {
    const counts = trace.cache[cacheName] ??= { hits: 0, misses: 0 }
    counts[hit ? 'hits' : 'misses']++
  })
}

export function recordRestaurantCall(trace, index, startedAt, outcome) {
  if (!trace || startedAt === null) return
  safely(() => trace.restaurantCalls.push({
    index,
    provider: 'groq',
    durationMs: performance.now() - startedAt,
    outcome,
  }))
}

export function recordSingleFlight(trace, operation, participation, startedAt, outcome) {
  if (!trace || startedAt === null) return
  safely(() => {
    const event = { operation, participation, outcome }
    if (participation === 'joined') event.waitMs = performance.now() - startedAt
    trace.singleFlight.push(event)
  })
}

export function recordProviderQueue(trace, provider, queueWaitMs, queueLength) {
  if (!trace || !Number.isFinite(queueWaitMs)) return
  safely(() => trace.providerQueue.push({ provider, queueWaitMs, queueLength }))
}

export function recordProviderQueueOutcome(trace, provider, outcome, queueWaitMs, queueLength) {
  if (!trace) return
  safely(() => trace.providerQueue.push({
    provider,
    outcome,
    ...(Number.isFinite(queueWaitMs) ? { queueWaitMs } : {}),
    ...(Number.isFinite(queueLength) ? { queueLength } : {}),
  }))
}
