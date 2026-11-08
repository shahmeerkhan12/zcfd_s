import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SingleFlight } from '../src/shared/cache/singleFlight.js'
import { normalizeQuery } from '../src/modules/llm/service.js'
import { searchRestaurants } from '../src/modules/restaurants/service.js'
import { generateMenuItems } from '../src/modules/restaurants/menuGenerator.js'
import { createApp } from '../src/index.js'
import { measureStage, recordSingleFlight, startTiming } from '../src/shared/performanceMetrics.js'

const nextTurn = () => new Promise((resolve) => setImmediate(resolve))

function chatCompletionResponse(content) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(content) } }],
    }),
  }
}

function createMetricsTrace() {
  return { providerCalls: [], singleFlight: [], restaurantCalls: [], stagesMs: {}, cache: {} }
}

test('single-flight shares pending work by key and cleans up after success', async () => {
  const flights = new SingleFlight()
  let releaseShared
  let operationCalls = 0
  const sharedResult = new Promise((resolve) => { releaseShared = resolve })

  const first = flights.run('same-key', () => {
    operationCalls++
    return sharedResult
  })
  const joined = flights.run('same-key', () => {
    operationCalls++
    return 'unexpected second operation'
  })
  const different = flights.run('different-key', () => {
    operationCalls++
    return 'independent result'
  })

  await nextTurn()
  assert.equal(operationCalls, 2)
  assert.equal(await different, 'independent result')
  releaseShared('shared result')
  assert.deepEqual(await Promise.all([first, joined]), ['shared result', 'shared result'])

  const afterCompletion = await flights.run('same-key', () => {
    operationCalls++
    return 'new operation after cleanup'
  })
  assert.equal(afterCompletion, 'new operation after cleanup')
  assert.equal(operationCalls, 3)
})

test('single-flight removes rejected work so the same key can retry', async () => {
  const flights = new SingleFlight()
  let attempts = 0

  await assert.rejects(flights.run('retry-key', () => {
    attempts++
    throw new Error('synthetic failure')
  }), /synthetic failure/)

  const retried = await flights.run('retry-key', () => {
    attempts++
    return 'retry succeeded'
  })

  assert.equal(retried, 'retry succeeded')
  assert.equal(attempts, 2)
})

test('failed shared work is recorded for both leader and joining caller', async () => {
  const flights = new SingleFlight()
  let rejectWork
  const sharedWork = new Promise((_resolve, reject) => { rejectWork = reject })
  const leaderTrace = createMetricsTrace()
  const joinerTrace = createMetricsTrace()

  const observe = async (trace) => {
    const startedAt = startTiming(trace)
    const flight = flights.runWithStatus('failed-metric-key', () => sharedWork)
    let outcome = 'failure'
    try {
      return await flight.promise
    } finally {
      recordSingleFlight(
        trace,
        'normalization',
        flight.joined ? 'joined' : 'started',
        startedAt,
        outcome,
      )
    }
  }

  const leader = observe(leaderTrace)
  const joiner = observe(joinerTrace)
  await nextTurn()
  rejectWork(new Error('synthetic shared failure'))
  const results = await Promise.allSettled([leader, joiner])

  assert.deepEqual(results.map(({ status }) => status), ['rejected', 'rejected'])
  assert.deepEqual(leaderTrace.singleFlight, [{
    operation: 'normalization', participation: 'started', outcome: 'failure',
  }])
  assert.deepEqual(joinerTrace.singleFlight[0], {
    operation: 'normalization', participation: 'joined', outcome: 'failure',
    waitMs: joinerTrace.singleFlight[0].waitMs,
  })
  assert.ok(joinerTrace.singleFlight[0].waitMs > 0)
})

test('an abandoned waiter does not cancel work needed by another waiter', async () => {
  const flights = new SingleFlight()
  let releaseWork
  let operationCanceled = false
  const sharedWork = new Promise((resolve) => { releaseWork = resolve })
  const abandonedWaiter = flights.run('shared-work', () => sharedWork)
  const remainingWaiter = flights.run('shared-work', () => {
    operationCanceled = true
    return 'unexpected second operation'
  })

  // Dropping a caller's reference does not cancel the shared operation.
  void abandonedWaiter
  await nextTurn()
  assert.equal(operationCanceled, false)
  releaseWork('shared result')
  assert.equal(await remainingWaiter, 'shared result')
})

test('concurrent identical normalization calls share provider work and completed calls use cache', async () => {
  const originalFetch = globalThis.fetch
  const originalGroqKey = process.env.GROQ_API_KEY
  const pendingCalls = []
  process.env.GROQ_API_KEY = 'stage2-test-only'
  globalThis.fetch = async (_url, options) => {
    const rawText = JSON.parse(options.body).messages[1].content
    return new Promise((resolve) => pendingCalls.push({
      rawText,
      resolve: () => resolve(chatCompletionResponse({
        cleanQuery: rawText,
        category: 'pasta',
        dietary: [],
        maxBudget: null,
        speedPriority: false,
      })),
    }))
  }

  try {
    const suffix = `${Date.now()}-${Math.random()}`
    const sharedQuery = `stage2 normalization shared ${suffix}`
    const independentQuery = `stage2 normalization independent ${suffix}`
    const leaderTrace = createMetricsTrace()
    const joinerTrace = createMetricsTrace()
    const independentTrace = createMetricsTrace()
    const first = normalizeQuery(sharedQuery, leaderTrace)
    const joined = normalizeQuery(sharedQuery, joinerTrace)
    const independent = normalizeQuery(independentQuery, independentTrace)

    await nextTurn()
    assert.equal(pendingCalls.length, 2)
    assert.deepEqual(new Set(pendingCalls.map((call) => call.rawText)), new Set([sharedQuery, independentQuery]))
    pendingCalls.forEach((call) => call.resolve())

    const [firstResult, joinedResult, independentResult] = await Promise.all([first, joined, independent])
    assert.equal(firstResult.cleanQuery, sharedQuery)
    assert.equal(joinedResult.cleanQuery, sharedQuery)
    assert.equal(independentResult.cleanQuery, independentQuery)
    assert.equal(leaderTrace.providerCalls.length, 1)
    assert.equal(leaderTrace.providerCalls[0].executed, true)
    assert.equal(joinerTrace.providerCalls.length, 0)
    assert.deepEqual(leaderTrace.singleFlight, [{
      operation: 'normalization', participation: 'started', outcome: 'success',
    }])
    assert.equal(joinerTrace.singleFlight[0].operation, 'normalization')
    assert.equal(joinerTrace.singleFlight[0].participation, 'joined')
    assert.equal(joinerTrace.singleFlight[0].outcome, 'success')
    assert.ok(joinerTrace.singleFlight[0].waitMs > 0)
    assert.equal(independentTrace.singleFlight[0].participation, 'started')

    const cachedTrace = createMetricsTrace()
    const cached = await normalizeQuery(sharedQuery, cachedTrace)
    assert.equal(cached.cached, true)
    assert.equal(pendingCalls.length, 2)
    assert.equal(cachedTrace.singleFlight.length, 0)
  } finally {
    globalThis.fetch = originalFetch
    if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY
    else process.env.GROQ_API_KEY = originalGroqKey
  }
})

test('concurrent identical restaurant searches share Foursquare work and retain fallback behavior', async () => {
  const originalFetch = globalThis.fetch
  const originalFoursquareKey = process.env.FOURSQUARE_API_KEY
  const pendingCalls = []
  process.env.FOURSQUARE_API_KEY = 'stage2-test-only'
  globalThis.fetch = async (url) => {
    const query = new URL(url).searchParams.get('query')
    if (query.includes('synthetic-failure')) throw new Error('synthetic Foursquare failure')
    return new Promise((resolve) => pendingCalls.push({
      query,
      resolve: () => resolve({
        ok: true,
        json: async () => ({ results: [{ fsq_id: `fsq-${query}`, name: `Place ${query}` }] }),
      }),
    }))
  }

  try {
    const suffix = `${Date.now()}-${Math.random()}`
    const sharedOptions = { lat: 49.1234, lng: 30.9876, keyword: `stage2-shared-${suffix}` }
    const independentOptions = { ...sharedOptions, keyword: `stage2-independent-${suffix}` }
    const leaderTrace = createMetricsTrace()
    const joinerTrace = createMetricsTrace()
    const independentTrace = createMetricsTrace()
    const first = searchRestaurants(sharedOptions, leaderTrace)
    const joined = searchRestaurants(sharedOptions, joinerTrace)
    const independent = searchRestaurants(independentOptions, independentTrace)

    await nextTurn()
    assert.equal(pendingCalls.length, 2)
    assert.deepEqual(
      new Set(pendingCalls.map((call) => call.query)),
      new Set([sharedOptions.keyword, independentOptions.keyword]),
    )
    pendingCalls.forEach((call) => call.resolve())

    const [firstResult, joinedResult, independentResult] = await Promise.all([first, joined, independent])
    assert.equal(firstResult.source, 'foursquare')
    assert.equal(joinedResult.source, 'foursquare')
    assert.equal(independentResult.restaurants[0].name, `Place ${independentOptions.keyword}`)
    assert.equal(leaderTrace.providerCalls.length, 1)
    assert.equal(leaderTrace.providerCalls[0].provider, 'foursquare')
    assert.equal(leaderTrace.providerCalls[0].executed, true)
    assert.equal(joinerTrace.providerCalls.length, 0)
    assert.deepEqual(leaderTrace.singleFlight, [{
      operation: 'restaurant_search', participation: 'started', outcome: 'success',
    }])
    assert.equal(joinerTrace.singleFlight[0].operation, 'restaurant_search')
    assert.equal(joinerTrace.singleFlight[0].participation, 'joined')
    assert.equal(joinerTrace.singleFlight[0].outcome, 'success')
    assert.ok(joinerTrace.singleFlight[0].waitMs > 0)
    assert.equal(independentTrace.singleFlight[0].participation, 'started')
    assert.equal((await searchRestaurants(sharedOptions)).cached, true)
    assert.equal(pendingCalls.length, 2)

    const failedOptions = { ...sharedOptions, keyword: `stage2-synthetic-failure-${suffix}` }
    const fallbackTrace = createMetricsTrace()
    const fallback = await searchRestaurants(failedOptions, fallbackTrace)
    const cachedFallback = await searchRestaurants(failedOptions)
    assert.equal(fallback.source, 'local')
    assert.equal(cachedFallback.source, 'local')
    assert.equal(cachedFallback.cached, true)
    assert.equal(fallbackTrace.providerCalls[0].executed, true)
    assert.equal(fallbackTrace.providerCalls[0].outcome, 'no_result')
    assert.equal(fallbackTrace.singleFlight[0].outcome, 'fallback')
  } finally {
    globalThis.fetch = originalFetch
    if (originalFoursquareKey === undefined) delete process.env.FOURSQUARE_API_KEY
    else process.env.FOURSQUARE_API_KEY = originalFoursquareKey
  }
})

test('concurrent identical menu generations share provider work and retry after provider failure', async () => {
  const originalFetch = globalThis.fetch
  const originalGroqKey = process.env.GROQ_API_KEY
  const pendingCalls = []
  const attemptsByQuery = new Map()
  process.env.GROQ_API_KEY = 'stage2-test-only'
  globalThis.fetch = async (_url, options) => {
    const prompt = JSON.parse(options.body).messages[1].content
    const cleanQuery = prompt.match(/The user is looking for: "([^"]+)"/)?.[1]
    const attempt = (attemptsByQuery.get(cleanQuery) ?? 0) + 1
    attemptsByQuery.set(cleanQuery, attempt)

    if (cleanQuery.includes('retry-after-failure') && attempt === 1) {
      throw new Error('synthetic provider failure')
    }

    return new Promise((resolve) => pendingCalls.push({
      cleanQuery,
      resolve: () => resolve(chatCompletionResponse({
        items: [{
          id: `stage2-menu-${cleanQuery}-${attempt}`,
          name: `Generated for ${cleanQuery}`,
          description: 'Mock generated dish.',
          price: 15,
          prepTime: 20,
          rating: 4.5,
          tag: 'Test',
          dietary: [],
        }],
      })),
    }))
  }

  try {
    const restaurant = {
      id: 'stage2-single-flight-restaurant',
      name: `Stage 2 Single Flight ${Date.now()}-${Math.random()}`,
      lat: 50.45,
      lng: 30.52,
    }
    const baseIntent = { category: 'pasta', dietary: ['vegetarian'], maxBudget: 20 }
    const leaderTrace = createMetricsTrace()
    const joinerTrace = createMetricsTrace()
    const independentTrace = createMetricsTrace()
    const first = measureStage(leaderTrace, 'menuGenerationMs', () =>
      generateMenuItems([restaurant], { ...baseIntent, cleanQuery: 'stage2 shared pasta' }, 6, leaderTrace),
    )
    const joined = measureStage(joinerTrace, 'menuGenerationMs', () =>
      generateMenuItems([restaurant], { ...baseIntent, cleanQuery: 'stage2 shared pasta' }, 6, joinerTrace),
    )
    const independent = measureStage(independentTrace, 'menuGenerationMs', () =>
      generateMenuItems([restaurant], { ...baseIntent, cleanQuery: 'stage2 independent pasta' }, 6, independentTrace),
    )

    await nextTurn()
    assert.equal(pendingCalls.length, 2)
    assert.deepEqual(
      new Set(pendingCalls.map((call) => call.cleanQuery)),
      new Set(['stage2 shared pasta', 'stage2 independent pasta']),
    )
    pendingCalls.forEach((call) => call.resolve())

    const [firstResult, joinedResult, independentResult] = await Promise.all([first, joined, independent])
    assert.equal(firstResult.items[0].name, joinedResult.items[0].name)
    assert.match(independentResult.items[0].name, /stage2 independent pasta/)
    assert.equal(leaderTrace.providerCalls.length, 1)
    assert.equal(leaderTrace.providerCalls[0].provider, 'groq_menu')
    assert.equal(leaderTrace.providerCalls[0].executed, true)
    assert.equal(joinerTrace.providerCalls.length, 0)
    assert.equal(leaderTrace.restaurantCalls.length, 1)
    assert.equal(joinerTrace.restaurantCalls.length, 0)
    assert.deepEqual(leaderTrace.singleFlight, [{
      operation: 'menu_generation', participation: 'started', outcome: 'success',
    }])
    assert.equal(joinerTrace.singleFlight[0].operation, 'menu_generation')
    assert.equal(joinerTrace.singleFlight[0].participation, 'joined')
    assert.equal(joinerTrace.singleFlight[0].outcome, 'success')
    assert.ok(joinerTrace.singleFlight[0].waitMs > 0)
    assert.ok(joinerTrace.stagesMs.menuGenerationMs >= joinerTrace.singleFlight[0].waitMs)
    assert.equal(independentTrace.singleFlight[0].participation, 'started')
    assert.equal((await generateMenuItems(
      [restaurant],
      { ...baseIntent, cleanQuery: 'stage2 shared pasta' },
    )).items[0].name, firstResult.items[0].name)
    assert.equal(pendingCalls.length, 2)

    const retryIntent = { ...baseIntent, cleanQuery: 'stage2 retry-after-failure pasta' }
    const failedLeaderTrace = createMetricsTrace()
    const failedJoinerTrace = createMetricsTrace()
    const failedLeader = generateMenuItems([restaurant], retryIntent, 6, failedLeaderTrace)
    const failedJoiner = generateMenuItems([restaurant], retryIntent, 6, failedJoinerTrace)
    assert.deepEqual(await Promise.all([failedLeader, failedJoiner]), [null, null])
    assert.deepEqual(failedLeaderTrace.singleFlight, [{
      operation: 'menu_generation', participation: 'started', outcome: 'fallback',
    }])
    assert.equal(failedJoinerTrace.singleFlight[0].operation, 'menu_generation')
    assert.equal(failedJoinerTrace.singleFlight[0].participation, 'joined')
    assert.equal(failedJoinerTrace.singleFlight[0].outcome, 'fallback')
    assert.equal(failedLeaderTrace.providerCalls[0].executed, true)
    assert.equal(failedLeaderTrace.providerCalls[0].outcome, 'no_result')
    assert.equal(failedJoinerTrace.providerCalls.length, 0)
    assert.equal(failedJoinerTrace.restaurantCalls.length, 0)

    const retryTrace = createMetricsTrace()
    const retried = generateMenuItems([restaurant], retryIntent, 6, retryTrace)
    await nextTurn()
    assert.equal(pendingCalls.length, 3)
    pendingCalls[2].resolve()
    assert.match((await retried).items[0].name, /retry-after-failure/)
    assert.equal(attemptsByQuery.get(retryIntent.cleanQuery), 2)
    assert.equal(retryTrace.singleFlight[0].participation, 'started')
    assert.equal(retryTrace.singleFlight[0].outcome, 'success')
  } finally {
    globalThis.fetch = originalFetch
    if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY
    else process.env.GROQ_API_KEY = originalGroqKey
  }
})

test('restaurant endpoint response structure remains unchanged', async () => {
  const providerKeys = ['GROQ_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'FOURSQUARE_API_KEY']
  const previousValues = new Map(providerKeys.map((key) => [key, process.env[key]]))
  for (const key of providerKeys) delete process.env[key]

  const server = createApp().listen(0, '127.0.0.1')
  const originalInfo = console.info
  const capturedLogs = []
  console.info = (...args) => capturedLogs.push(args.map(String).join(' '))
  try {
    await new Promise((resolve) => server.once('listening', resolve))
    const url = new URL('/api/restaurants', `http://127.0.0.1:${server.address().port}`)
    url.searchParams.set('q', `stage2 response contract ${Date.now()} pasta`)
    const response = await fetch(url)
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.deepEqual(Object.keys(body).sort(), [
      'cached', 'intent', 'items', 'markers', 'menuSource', 'restaurants', 'source',
    ])
    assert.equal(body.source, 'local')
    assert.equal(body.menuSource, 'fallback')
    const performanceLogs = capturedLogs.filter((line) => line.includes('food_delivery_perf'))
    if (process.env.PERF_METRICS === '1') {
      assert.equal(performanceLogs.length, 1)
      const trace = JSON.parse(performanceLogs[0])
      assert.ok(trace.singleFlight.length > 0)
      assert.equal(performanceLogs[0].includes('stage2 response contract'), false)
      assert.ok(trace.providerCalls.every((call) => call.executed === false))
    } else {
      assert.equal(performanceLogs.length, 0)
    }
  } finally {
    console.info = originalInfo
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    for (const [key, value] of previousValues) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
