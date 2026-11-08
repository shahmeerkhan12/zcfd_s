import { performance } from 'node:perf_hooks'

export const DEFAULT_GROQ_MENU_CONCURRENCY = 4
export const DEFAULT_GROQ_MENU_MAX_PENDING = 8
export const DEFAULT_GROQ_MENU_MAX_QUEUE_WAIT_MS = 1_500

class QueueLimitError extends Error {
  constructor(message, { queueDepth, queueWaitMs = 0 } = {}) {
    super(message)
    this.name = new.target.name
    this.queueDepth = queueDepth
    this.queueWaitMs = queueWaitMs
  }
}

export class QueueFullError extends QueueLimitError {
  constructor(queueDepth) {
    super('Concurrency limiter pending queue is full.', { queueDepth })
  }
}

export class QueueTimeoutError extends QueueLimitError {
  constructor(queueDepth, queueWaitMs) {
    super('Concurrency limiter queue wait timed out.', { queueDepth, queueWaitMs })
  }
}

/** FIFO async limiter with bounded pending work and removable queue entries. */
export class ConcurrencyLimiter {
  #limit
  #maxPending
  #maxQueueWaitMs
  #activeCount = 0
  #pendingCount = 0
  #head = null
  #tail = null

  constructor(limit, { maxPending = 8, maxQueueWaitMs = 1_500 } = {}) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error('Concurrency limit must be a positive integer.')
    }
    if (!Number.isInteger(maxPending) || maxPending < 0) {
      throw new Error('Maximum pending count must be a non-negative integer.')
    }
    if (!Number.isFinite(maxQueueWaitMs) || maxQueueWaitMs < 0) {
      throw new Error('Maximum queue wait must be a non-negative number.')
    }

    this.#limit = limit
    this.#maxPending = maxPending
    this.#maxQueueWaitMs = maxQueueWaitMs
  }

  get limit() {
    return this.#limit
  }

  get maxPending() {
    return this.#maxPending
  }

  get maxQueueWaitMs() {
    return this.#maxQueueWaitMs
  }

  get activeCount() {
    return this.#activeCount
  }

  get queuedCount() {
    return this.#pendingCount
  }

  run(operation, onStart = null) {
    if (typeof operation !== 'function') {
      return Promise.reject(new TypeError('Limited operation must be a function.'))
    }

    if (this.#activeCount < this.#limit && this.#pendingCount === 0) {
      return new Promise((resolve, reject) => {
        this.#start({ operation, resolve, reject, onStart, enqueuedAt: null, queueDepthAtEnqueue: 0 })
      })
    }

    if (this.#pendingCount >= this.#maxPending) {
      return Promise.reject(new QueueFullError(this.#pendingCount))
    }

    let resolveTask
    let rejectTask
    const result = new Promise((resolve, reject) => {
      resolveTask = resolve
      rejectTask = reject
    })
    let enqueuedAt = null
    if (typeof onStart === 'function') {
      try {
        enqueuedAt = performance.now()
      } catch {
        // Queue timing is optional and must not affect the limited operation.
      }
    }

    const task = {
      operation,
      resolve: resolveTask,
      reject: rejectTask,
      onStart,
      enqueuedAt,
      queueDepthAtEnqueue: this.#pendingCount + 1,
      state: 'queued',
      previous: this.#tail,
      next: null,
      timer: null,
    }

    if (this.#tail) this.#tail.next = task
    else this.#head = task
    this.#tail = task
    this.#pendingCount++
    task.timer = setTimeout(() => this.#expire(task), this.#maxQueueWaitMs)
    return result
  }

  #unlink(task) {
    if (task.previous) task.previous.next = task.next
    else this.#head = task.next
    if (task.next) task.next.previous = task.previous
    else this.#tail = task.previous
    task.previous = null
    task.next = null
    this.#pendingCount--
  }

  #expire(task) {
    if (task.state !== 'queued') return

    const queueDepth = this.#pendingCount
    let queueWaitMs = this.#maxQueueWaitMs
    if (task.enqueuedAt !== null) {
      try {
        queueWaitMs = performance.now() - task.enqueuedAt
      } catch {
        // Retain the configured timeout as the best available measurement.
      }
    }

    task.state = 'settled'
    this.#unlink(task)
    task.timer = null
    task.reject(new QueueTimeoutError(queueDepth, queueWaitMs))
  }

  #drain() {
    while (this.#activeCount < this.#limit && this.#head) {
      const task = this.#head
      this.#unlink(task)
      if (task.timer) clearTimeout(task.timer)
      task.timer = null
      task.state = 'running'
      this.#start(task)
    }
  }

  #start(task) {
    task.state = 'running'
    this.#activeCount++

    if (typeof task.onStart === 'function') {
      try {
        let queueWaitMs = 0
        if (task.enqueuedAt !== null) queueWaitMs = performance.now() - task.enqueuedAt
        task.onStart({
          queueWaitMs,
          queueLength: task.queueDepthAtEnqueue,
          activeCount: this.#activeCount,
          limit: this.#limit,
        })
      } catch {
        // Instrumentation callbacks must never affect application behavior.
      }
    }

    void this.#execute(task)
  }

  async #execute(task) {
    try {
      task.resolve(await task.operation())
    } catch (error) {
      task.reject(error)
    } finally {
      task.state = 'settled'
      this.#activeCount--
      this.#drain()
    }
  }
}

export const groqMenuGenerationLimiter = new ConcurrencyLimiter(
  DEFAULT_GROQ_MENU_CONCURRENCY,
  {
    maxPending: DEFAULT_GROQ_MENU_MAX_PENDING,
    maxQueueWaitMs: DEFAULT_GROQ_MENU_MAX_QUEUE_WAIT_MS,
  },
)
