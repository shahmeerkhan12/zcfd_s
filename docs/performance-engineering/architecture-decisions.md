# Architecture Decisions

## Cache-key completeness

Each key should represent all inputs that can change the cached result.

- Normalization uses the full raw input.
- SQLite menu matching includes cleaned query, category, dietary filters, budget, and result limit.
- Generated menus include restaurant ID, name, coordinates, category, dietary filters, budget, and `cleanQuery`.
- Generated-menu cache and single-flight use the same complete key.

These keys reduce accidental result reuse between different requests, limits, restaurants, or restaurant locations.

## Single-flight

Single-flight stores pending promises separately from completed-result caches. It is applied to normalization, restaurant search, and generated-menu generation. Identical concurrent callers share the pending operation; distinct keys proceed independently. Entries are removed after resolution or rejection. Callers do not pass request cancellation signals into shared operations, so one waiter cannot cancel work needed by another.

The registries are process-local; multiple server processes do not share pending work.

## Menu-provider concurrency

Configured Groq menu-generation operations use one process-wide FIFO limiter:

| Setting | Value |
|---|---:|
| Active operations | 4 |
| Pending queue tasks | 8 |
| Maximum queued wait | 1,500 ms |

The limiter sits after generated-menu cache lookup and single-flight leader selection. Cache hits and joiners do not use additional queue capacity. The per-request four-restaurant cap and parallel menu calls remain unchanged. Normalization and Foursquare do not use this limiter, so it is not a global provider concurrency limit.

## Queue overload and SQLite fallback

Queue-full and queued-timeout errors are typed separately. A queued timeout removes the task before it can start and does not release an active slot. Only the running task's `finally` path releases its slot. The menu generator catches only these two queue errors and returns its existing no-generated-menu signal; the controller then uses its existing SQLite menu-matching fallback when no generated menu is available.

Overload can therefore preserve the endpoint response path while returning locally matched results. With four concurrent distinct requests and four restaurants per request, demand can reach 16 menu operations while the limiter admits four active plus eight pending; some tasks may fall back.

## Instrumentation

`PERF_METRICS=1` enables internal structured traces. Metrics include stage timing, provider execution/outcomes, cache hit/miss counts, single-flight participation, queue events, and server response finish. Metrics do not log user prompts, credentials, customer data, restaurant names, or response bodies. `responseFinishMs` ends at the server's response-finish event; it is distinct from client-observed endpoint time.

## Trade-offs and limitations

- Four active and eight pending are experimental defaults, not values validated against real provider quotas.
- Timer callbacks are subject to event-loop scheduling; measured queue wait can exceed 1,500 ms slightly.
- A process-local limiter does not coordinate across instances.
- Normalization and restaurant-search provider work is not covered by the menu limiter.
- Cache capacity is not bounded by a maximum entry count in the current design.
- Synchronous SQLite operations can block the Node.js event loop.
- Shared provider work is not automatically cancelled when a client disconnects.
- Mocked-provider results characterize only the local test harness. Real provider performance remains unmeasured.
