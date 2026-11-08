# Performance Engineering

This folder documents the Zero-Click Food Delivery server work focused on cache correctness, duplicate-request suppression, observability, and safe provider concurrency. It describes changes in the worktree; it does not mean those changes have been committed or published.

## Request path

The restaurant endpoint in `server/src/modules/restaurants/controller.js` coordinates:

`query normalization → restaurant search → per-restaurant menu generation → SQLite matching when generation returns no menu → response`

The endpoint preserves its existing response structure. Normalization and restaurant search remain sequential because each stage uses the preceding stage's output. Up to four restaurant menus are generated concurrently for a request.

## Completed engineering work

- Cache keys now distinguish complete normalization inputs, generated-menu intent and restaurant metadata, and SQLite result limits.
- Process-local single-flight registries share pending normalization, restaurant-search, and menu-generation work for identical keys.
- Optional internal metrics are enabled with `PERF_METRICS=1`. They record stage durations, provider execution/outcomes, cache counts, single-flight participation, queue events, and server response-finish time.
- Configured Groq menu-generation operations use a FIFO limiter: four active operations, at most eight pending tasks, and a 1,500 ms pending wait limit. Queue-full and queue-timeout outcomes return the existing no-generated-menu signal, allowing the controller's SQLite fallback to run.
- Generated menu images prefer a mapped dish-name keyword, then a category keyword, then the default image.

The image and performance work shares `server/src/modules/restaurants/menuGenerator.js`; changes to that file need selective hunk review when preparing commits.

## Contribution

The contribution documented here is backend AI-pipeline and performance engineering: cache correctness, pending-work deduplication, instrumentation, bounded menu-provider concurrency, queue-overload fallback, and dish-specific generated-menu image selection. Existing provider integrations, discovery, menu generation contract, database behavior, and frontend flows were retained.

## Validation

The latest full server test run reported 34/34 passing with `PERF_METRICS=0` and 34/34 with `PERF_METRICS=1`, serially and with `DATABASE_PATH=:memory:`. The mocked-provider end-to-end benchmark and local-fallback comparison are in [benchmark-results.md](./benchmark-results.md). Real Groq, Gemini, OpenAI, and Foursquare performance has not been measured.

Run tests without loading `.env` or using the persistent project database:

```powershell
$env:DATABASE_PATH = ':memory:'
$env:PERF_METRICS = '0' # repeat with '1'
node --experimental-sqlite --test --test-concurrency=1
```

## Documents

- [Benchmark results](./benchmark-results.md)
- [Optimization history](./optimization-history.md)
- [Architecture decisions](./architecture-decisions.md)
