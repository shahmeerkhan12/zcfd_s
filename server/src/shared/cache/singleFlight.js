/**
 * Share pending asynchronous work for the same key within one cache domain.
 * Completed values and failures remain the caller's responsibility.
 * Callers cannot pass cancellation signals, so one waiter cannot abort shared work.
 */
export class SingleFlight {
  constructor() {
    this.pending = new Map()
  }

  run(key, operation) {
    return this.runWithStatus(key, operation).promise
  }

  runWithStatus(key, operation) {
    const existing = this.pending.get(key)
    if (existing) return { promise: existing, joined: true }

    const pending = Promise.resolve().then(operation)
    this.pending.set(key, pending)

    const cleanup = () => {
      if (this.pending.get(key) === pending) this.pending.delete(key)
    }
    pending.then(cleanup, cleanup)

    return { promise: pending, joined: false }
  }
}
