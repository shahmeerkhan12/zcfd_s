import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'
import {
  ConcurrencyLimiter,
  DEFAULT_GROQ_MENU_CONCURRENCY,
  DEFAULT_GROQ_MENU_MAX_PENDING,
  DEFAULT_GROQ_MENU_MAX_QUEUE_WAIT_MS,
  QueueFullError,
  QueueTimeoutError,
  groqMenuGenerationLimiter,
} from '../src/shared/concurrencyLimiter.js'
import { generateMenuItems } from '../src/modules/restaurants/menuGenerator.js'
import {
  recordProviderQueueOutcome,
  startPerfTrace,
} from '../src/shared/performanceMetrics.js'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

for (const limit of [2, 4, 8]) {
  test(`FIFO limiter enforces a concurrency limit of ${limit}`, async () => {
    const taskCount = limit * 3
    const limiter = new ConcurrencyLimiter(limit, { maxPending: taskCount, maxQueueWaitMs: 1_000 })
    const activeSamples = []
    const starts = []
    const queueStarts = []
    let active = 0
    let maximumActive = 0

    const tasks = Array.from({ length: taskCount }, (_, index) => limiter.run(async () => {
      active++
      maximumActive = Math.max(maximumActive, active)
      activeSamples.push(active)
      starts.push(index)
      await delay(6)
      active--
      return index
    }, (event) => queueStarts.push(event)))

    assert.equal(limiter.queuedCount, taskCount - limit)
    assert.deepEqual(await Promise.all(tasks), Array.from({ length: taskCount }, (_, index) => index))
    assert.ok(maximumActive <= limit)
    assert.equal(maximumActive, limit)
    assert.deepEqual(starts, Array.from({ length: taskCount }, (_, index) => index))
    assert.ok(activeSamples.every((sample) => sample <= limit))
    assert.equal(queueStarts.length, taskCount)
    assert.ok(queueStarts.every((event) => Number.isFinite(event.queueWaitMs)))
    assert.equal(limiter.activeCount, 0)
    assert.equal(limiter.queuedCount, 0)
  })
}

test('a thrown, rejected, or timed-out operation releases its slot', async () => {
  const limiter = new ConcurrencyLimiter(1)

  const synchronousFailure = limiter.run(() => {
    throw new Error('synthetic synchronous failure')
  })
  const afterSynchronousFailure = limiter.run(() => 'continued after synchronous failure')
  await assert.rejects(synchronousFailure, /synthetic synchronous failure/)
  assert.equal(await afterSynchronousFailure, 'continued after synchronous failure')

  const timedOut = limiter.run(async () => {
    await delay(6)
    throw new Error('synthetic timeout')
  })
  const afterTimeout = limiter.run(() => 'continued after timeout')
  await assert.rejects(timedOut, /synthetic timeout/)
  assert.equal(await afterTimeout, 'continued after timeout')
  assert.equal(limiter.activeCount, 0)
  assert.equal(limiter.queuedCount, 0)
})

test('the configured limiter admits eight pending tasks and rejects the ninth', async () => {
  const limiter = new ConcurrencyLimiter(1, { maxPending: 8, maxQueueWaitMs: 2_000 })
  let releaseActive
  const active = limiter.run(() => new Promise((resolve) => { releaseActive = resolve }))
  const pending = Array.from({ length: 8 }, (_, index) => limiter.run(() => index))

  assert.equal(DEFAULT_GROQ_MENU_CONCURRENCY, 4)
  assert.equal(DEFAULT_GROQ_MENU_MAX_PENDING, 8)
  assert.equal(DEFAULT_GROQ_MENU_MAX_QUEUE_WAIT_MS, 1_500)
  assert.equal(limiter.activeCount, 1)
  assert.equal(limiter.queuedCount, 8)
  await assert.rejects(limiter.run(() => 'never queued'), QueueFullError)
  assert.equal(limiter.queuedCount, 8)

  releaseActive('active done')
  assert.equal(await active, 'active done')
  assert.deepEqual(await Promise.all(pending), Array.from({ length: 8 }, (_, index) => index))
  assert.equal(limiter.activeCount, 0)
  assert.equal(limiter.queuedCount, 0)
})

test('a queued timeout is removed without releasing the active slot or changing FIFO order', async () => {
  const limiter = new ConcurrencyLimiter(1, { maxPending: 4, maxQueueWaitMs: 30 })
  let releaseActive
  const active = limiter.run(() => new Promise((resolve) => { releaseActive = resolve }))
  const starts = []
  const expires = limiter.run(() => starts.push('expired'))
  await delay(10)
  const second = limiter.run(() => starts.push('second'))
  await delay(10)
  const third = limiter.run(() => starts.push('third'))

  await assert.rejects(expires, QueueTimeoutError)
  assert.equal(limiter.activeCount, 1)
  assert.equal(limiter.queuedCount, 2)
  assert.deepEqual(starts, [])

  releaseActive('released')
  await active
  await Promise.all([second, third])
  assert.deepEqual(starts, ['second', 'third'])
  assert.equal(limiter.activeCount, 0)
  assert.equal(limiter.queuedCount, 0)
})

test('promotion near the queue deadline starts a task at most once', async () => {
  const limiter = new ConcurrencyLimiter(1, { maxPending: 1, maxQueueWaitMs: 40 })
  let releaseActive
  const active = limiter.run(() => new Promise((resolve) => { releaseActive = resolve }))
  let starts = 0
  const queued = limiter.run(() => { starts++; return 'started once' })
  setTimeout(() => releaseActive('released'), 20)

  assert.equal(await queued, 'started once')
  await active
  await delay(45)
  assert.equal(starts, 1)
  assert.equal(limiter.activeCount, 0)
  assert.equal(limiter.queuedCount, 0)
})

test('a limiter accepts new work after overload is relieved', async () => {
  const limiter = new ConcurrencyLimiter(1, { maxPending: 0 })
  let releaseActive
  const active = limiter.run(() => new Promise((resolve) => { releaseActive = resolve }))
  await assert.rejects(limiter.run(() => 'rejected'), QueueFullError)
  releaseActive('done')
  await active
  assert.equal(await limiter.run(() => 'recovered'), 'recovered')
})

test('queue overload falls back, while unrelated errors remain rejections', async () => {
  const originalFetch = globalThis.fetch
  const originalGroqKey = process.env.GROQ_API_KEY
  const originalRun = groqMenuGenerationLimiter.run
  process.env.GROQ_API_KEY = 'stage3c-test-only'
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify({ items: [{
      id: 'stage3c-cache-item',
      name: 'Stage 3C Cached Pasta',
      description: 'Mock cached dish.',
      price: 15,
      prepTime: 20,
      rating: 4.5,
      tag: 'Test',
      dietary: [],
    }] }) } }] }),
  })

  const holdSlots = () => {
    let release
    const gate = new Promise((resolve) => { release = resolve })
    const tasks = Array.from({ length: DEFAULT_GROQ_MENU_CONCURRENCY }, () =>
      groqMenuGenerationLimiter.run(() => gate),
    )
    return { tasks, release }
  }

  try {
    const suffix = `${Date.now()}-${Math.random()}`
    const intent = { cleanQuery: `stage3c ${suffix}`, category: 'pasta', dietary: [], maxBudget: null }
    const restaurant = { id: `stage3c-${suffix}`, name: `Stage 3C ${suffix}`, lat: 50.45, lng: 30.52 }

    const populatedCache = await generateMenuItems([restaurant], intent)
    assert.equal(populatedCache?.source, 'llm')
    globalThis.fetch = async () => { throw new Error('provider must not start') }

    const fullSlots = holdSlots()
    await Promise.resolve()
    const fillers = Array.from({ length: DEFAULT_GROQ_MENU_MAX_PENDING - 1 }, () =>
      groqMenuGenerationLimiter.run(() => 'filler'),
    )

    const leaderRestaurant = { ...restaurant, id: `${restaurant.id}-single-flight` }
    const leaderIntent = { ...intent, cleanQuery: `${intent.cleanQuery} queued` }
    const leader = generateMenuItems([leaderRestaurant], leaderIntent)
    const joiner = generateMenuItems([leaderRestaurant], leaderIntent)
    await Promise.resolve()
    assert.equal(groqMenuGenerationLimiter.queuedCount, DEFAULT_GROQ_MENU_MAX_PENDING)

    const cachedDuringOverload = await generateMenuItems([restaurant], intent)
    assert.equal(cachedDuringOverload?.items[0].id, populatedCache.items[0].id)
    assert.equal(groqMenuGenerationLimiter.queuedCount, DEFAULT_GROQ_MENU_MAX_PENDING)

    const rejectedTrace = { providerQueue: [], providerCalls: [], cache: {} }
    const rejected = await generateMenuItems(
      [{ ...restaurant, id: `${restaurant.id}-queue-full` }],
      { ...intent, cleanQuery: `${intent.cleanQuery} queue full` },
      6,
      rejectedTrace,
    )
    assert.equal(rejected, null)
    assert.equal(rejectedTrace.providerQueue[0].outcome, 'queue_rejected')
    assert.equal(rejectedTrace.providerCalls.length, 0)

    fullSlots.release('released')
    await Promise.all([...fullSlots.tasks, ...fillers, leader, joiner])
    assert.equal(groqMenuGenerationLimiter.activeCount, 0)
    assert.equal(groqMenuGenerationLimiter.queuedCount, 0)

    const activeSlots = holdSlots()
    await Promise.resolve()
    const timedOutTrace = { providerQueue: [], providerCalls: [], cache: {} }
    const timedOutGeneration = generateMenuItems(
      [{ ...restaurant, id: `${restaurant.id}-timeout` }],
      { ...intent, cleanQuery: `${intent.cleanQuery} timeout` },
      6,
      timedOutTrace,
    )
    await delay(DEFAULT_GROQ_MENU_MAX_QUEUE_WAIT_MS + 30)
    assert.equal(await timedOutGeneration, null)
    assert.equal(timedOutTrace.providerQueue[0].outcome, 'queue_timeout')
    assert.equal(timedOutTrace.providerCalls.length, 0)
    assert.equal(groqMenuGenerationLimiter.activeCount, DEFAULT_GROQ_MENU_CONCURRENCY)
    assert.equal(groqMenuGenerationLimiter.queuedCount, 0)
    activeSlots.release('released')
    await Promise.all(activeSlots.tasks)

    groqMenuGenerationLimiter.run = () => Promise.reject(new Error('unrelated limiter failure'))
    await assert.rejects(
      generateMenuItems(
        [{ ...restaurant, id: `${restaurant.id}-exception` }],
        { ...intent, cleanQuery: `${intent.cleanQuery} exception` },
      ),
      /unrelated limiter failure/,
    )
  } finally {
    delete groqMenuGenerationLimiter.run
    globalThis.fetch = originalFetch
    if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY
    else process.env.GROQ_API_KEY = originalGroqKey
  }
})

test('queue outcome metrics remain opt-in and safely distinguish overload reasons', () => {
  const response = new EventEmitter()
  const originalInfo = console.info
  const logs = []
  console.info = (line) => logs.push(String(line))

  try {
    const trace = startPerfTrace({}, response)
    if (process.env.PERF_METRICS === '1') {
      assert.ok(trace)
      recordProviderQueueOutcome(trace, 'groq_menu', 'queue_rejected', 0, 8)
      recordProviderQueueOutcome(trace, 'groq_menu', 'queue_timeout', 1_500, 3)
      response.emit('finish')
      const log = JSON.parse(logs[0])
      assert.deepEqual(log.providerQueue, [
        { provider: 'groq_menu', outcome: 'queue_rejected', queueWaitMs: 0, queueLength: 8 },
        { provider: 'groq_menu', outcome: 'queue_timeout', queueWaitMs: 1_500, queueLength: 3 },
      ])
    } else {
      assert.equal(trace, null)
      assert.equal(logs.length, 0)
    }
  } finally {
    console.info = originalInfo
  }
})

test('menu provider operations share one process-wide limit; joins and cache hits bypass it', async () => {
  const originalFetch = globalThis.fetch
  const originalGroqKey = process.env.GROQ_API_KEY
  let active = 0
  let maximumActive = 0
  let fetchCalls = 0
  const failedKeys = new Set()
  process.env.GROQ_API_KEY = 'stage3b-test-only'
  globalThis.fetch = async (_url, options) => {
    const prompt = JSON.parse(options.body).messages[1].content
    const query = prompt.match(/The user is looking for: "([^"]+)"/)?.[1] ?? ''
    fetchCalls++
    active++
    maximumActive = Math.max(maximumActive, active)

    try {
      await delay(6)
      if (query.includes('stage3b-fail-once') && !failedKeys.has(query)) {
        failedKeys.add(query)
        throw new Error('synthetic provider rejection')
      }

      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                items: [{
                  id: `stage3b-menu-${fetchCalls}`,
                  name: 'Mock Generated Pasta',
                  description: 'Mock generated dish.',
                  price: 15,
                  prepTime: 20,
                  rating: 4.5,
                  tag: 'Test',
                  dietary: [],
                }],
              }),
            },
          }],
        }),
      }
    } finally {
      active--
    }
  }

  try {
    assert.equal(DEFAULT_GROQ_MENU_CONCURRENCY, 4)
    assert.equal(groqMenuGenerationLimiter.limit, DEFAULT_GROQ_MENU_CONCURRENCY)
    const suffix = `${Date.now()}-${Math.random()}`
    const requests = Array.from({ length: 3 }, (_, requestIndex) => {
      const restaurants = Array.from({ length: 4 }, (_, restaurantIndex) => ({
        id: `stage3b-${suffix}-r${requestIndex}-d${restaurantIndex}`,
        name: `Stage 3B ${suffix} restaurant ${requestIndex}-${restaurantIndex}`,
        lat: 50.4 + restaurantIndex / 100,
        lng: 30.5 + requestIndex / 100,
      }))
      return generateMenuItems(restaurants, {
        cleanQuery: `stage3b distinct ${suffix} request ${requestIndex}`,
        category: 'pasta',
        dietary: [],
        maxBudget: null,
      })
    })

    const results = await Promise.all(requests)
    assert.ok(results.every((result) => result?.source === 'llm'))
    assert.equal(fetchCalls, 12)
    assert.equal(maximumActive, DEFAULT_GROQ_MENU_CONCURRENCY)
    assert.equal(groqMenuGenerationLimiter.activeCount, 0)
    assert.equal(groqMenuGenerationLimiter.queuedCount, 0)

    const sharedRestaurant = {
      id: `stage3b-${suffix}-shared-id`,
      name: `Stage 3B ${suffix} shared restaurant`,
      lat: 50.45,
      lng: 30.52,
    }
    const sharedIntent = {
      cleanQuery: `stage3b shared ${suffix}`,
      category: 'pasta',
      dietary: [],
      maxBudget: null,
    }
    const beforeSharedCalls = fetchCalls
    const sharedResults = await Promise.all(Array.from({ length: 8 }, () =>
      generateMenuItems([sharedRestaurant], sharedIntent),
    ))
    assert.ok(sharedResults.every((result) => result?.source === 'llm'))
    assert.equal(fetchCalls - beforeSharedCalls, 1)

    const afterSharedCalls = fetchCalls
    const cached = await generateMenuItems([sharedRestaurant], sharedIntent)
    assert.equal(cached?.source, 'llm')
    assert.equal(fetchCalls, afterSharedCalls)

    const retryIntent = { ...sharedIntent, cleanQuery: `stage3b-fail-once ${suffix}` }
    const failed = await generateMenuItems([sharedRestaurant], retryIntent)
    assert.equal(failed, null)
    const retried = await generateMenuItems([sharedRestaurant], retryIntent)
    assert.equal(retried?.source, 'llm')
    assert.equal(failedKeys.size, 1)
  } finally {
    globalThis.fetch = originalFetch
    if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY
    else process.env.GROQ_API_KEY = originalGroqKey
  }
})
