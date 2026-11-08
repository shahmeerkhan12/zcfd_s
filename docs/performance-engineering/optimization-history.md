# Optimization History

This history records completed stages and distinguishes implementation from read-only review. Stage results are local project measurements; mocked-provider numbers are not real provider benchmarks.

## Stage 1 — Cache correctness

- Normalization cache keys use the complete raw input rather than only the first 200 characters.
- Generated-menu cache keys include `cleanQuery`.
- SQLite menu-match cache keys include the requested `limit`.
- Regression coverage was added for long and repeated inputs, differing `cleanQuery`, and differing menu limits.

## Stage 2 — Single-flight deduplication

A reusable pending-promise registry shares identical pending operations. Separate registries cover normalization, restaurant search, and generated-menu requests. Pending entries are removed after success or rejection; failures are not cached as successful results.

## Stage 2.1 — Generated-menu key completeness

The generated-menu cache and its single-flight registry share a key containing restaurant ID, name, latitude, longitude, category, dietary requirements, budget, and `cleanQuery`. This prevents reused output from carrying metadata for another restaurant record or location.

## Stage 2.2 — Metrics clarity

Instrumentation distinguishes provider execution from skipped providers, and leaders from single-flight joiners. Join wait time and provider queue participation are recorded without logging prompts, credentials, customer data, restaurant names, or response bodies.

## Stage 3A — Read-only architecture audit

The audit identified up to four parallel menu-generation calls per request, concurrent provider work across distinct requests, process-local cache/single-flight behavior, and provider calls not covered by a shared global limiter at that stage. No source files were changed during the audit.

## Stage 3B — Menu concurrency limiter

A process-wide FIFO limiter was placed around configured Groq menu-generation operations, after result-cache lookup and single-flight leader selection. The active limit is four. Cache hits and joiners do not consume additional slots. Normalization and Foursquare are not limited by this component.

The candidate limits 2, 4, and 8 were compared with 20 concurrent mock HTTP requests and 35 ms synthetic operations. For distinct keys, endpoint P50/P95 were 997.12/1,839.56 ms at limit 2, 504.53/921.88 ms at limit 4, and 264.29/497.41 ms at limit 8. Four was selected as a bounded middle setting. These mock timings do not establish provider quota suitability.

## Stage 3C — Bounded queue and overload fallback

The limiter admits at most eight pending tasks and times out queued work after 1,500 ms. Typed queue-full and queue-timeout errors become the existing no-generated-menu signal, allowing the controller's existing SQLite matching fallback to run. Running work releases a slot only in its own `finally` path. No request-disconnect cancellation was introduced.

The full server suite passed 34/34 with `PERF_METRICS=0` and 34/34 with `PERF_METRICS=1`, including the dedicated menu image-selection regression tests, using serial execution and `DATABASE_PATH=:memory:`. Syntax checks and `git diff --check` passed.

## Stage 4A — End-to-end validation

The actual local Express endpoint was exercised at concurrency levels 1, 2, 4, 8, and 16 with deterministic mocked providers and in-memory SQLite. Workloads covered cold distinct keys, identical requests, warm repeats, mixed keys, 120 ms provider delays, provider failures, and a 900 ms queue-saturation case.

At 16 distinct requests, queue saturation observed four active menu operations, eight pending tasks, 52 queue rejections, four queue timeouts, and 14 SQLite fallback responses. No unexpected 500 responses or duplicate menu starts were observed. See [benchmark results](./benchmark-results.md) for tables and methodology.

## Menu image correction

The current `menuGenerator.js` implementation chooses a mapped keyword from the generated dish name first, then the category, then the default photo. The local `45c057b` commit also changes four seeded menu image IDs, but that commit is not in the current branch history and the seed file is unchanged in the current worktree. Those seed edits are not included in this documentation of the current worktree.

Dedicated image-selection regression tests in `server/test/menuImageSelection.test.js` cover dish-name keyword priority, category fallback, and the default image fallback.
