# Benchmark Results

## Scope and interpretation

All endpoint benchmarks described here used the local Express application. Provider-backed scenarios used deterministic mocked Groq and Foursquare responses and in-memory SQLite. No measured value below is a real external-provider measurement. Real Groq, Gemini, OpenAI, and Foursquare latency, quota behavior, and rate limits remain unknown. The sub-one-second AI target has not been proven for real providers.

Endpoint latency is client-side loopback request time through response parsing. `responseFinishMs` is the server-side performance metric from handler entry until Node emits the response `finish` event. The two measures have different boundaries.

Percentiles use nearest rank: sorted sample at `ceil(p × n)`. Each concurrency sample contained exactly as many endpoint requests as its concurrency level (1, 2, 4, 8, or 16); therefore P95 equals the maximum in these small samples. These are controlled local experiments, not production estimates.

## Local fallback measurements

An earlier local-only baseline used 155 requests across five fixed queries: five cold requests and 150 warm requests.

| Measurement | Cold P50 | Warm P50 | Warm P95 |
|---|---:|---:|---:|
| Client endpoint | 2.68 ms | 1.30 ms | 2.95 ms |
| Server response finish | 1.96 ms | 0.47 ms | 0.93 ms |
| Local normalization | 0.15 ms | 0.04 ms | 0.10 ms |
| Local restaurant fallback | 0.54 ms | 0.01 ms | 0.03 ms |
| SQLite matching | 0.82 ms | 0 ms | 0.02 ms |

A later reproduction used five prime requests followed by 155 sequential warm requests, `PERF_METRICS=0`, no provider credentials, and in-memory SQLite:

| Sample | P50 | P95 | Maximum |
|---|---:|---:|---:|
| 155 warm local-fallback endpoint requests | 1.43 ms | 2.67 ms | 3.75 ms |

The exact query set and runtime conditions of the earlier baseline are not known to be identical. These figures do not establish a definitive speedup.

## Mocked-provider end-to-end endpoint latency

Values are **P50 / P95 / maximum**, milliseconds. The cold-distinct, identical, warm, and mixed success cases used a 12 ms simulated provider delay. Warm samples followed one priming request, excluded from the sample. Mixed requests used up to four distinct request keys, repeated round-robin.

| Workload | 1 request | 2 requests | 4 requests | 8 requests | 16 requests |
|---|---:|---:|---:|---:|---:|
| Cold, distinct keys, provider success | 143.25 / 143.25 / 143.25 | 52.54 / 69.83 / 69.83 | 66.58 / 96.50 / 96.50 | 76.81 / 113.70 / 113.70 | 132.52 / 174.08 / 174.08 |
| Concurrent identical requests | 48.09 / 48.09 / 48.09 | 52.06 / 52.20 / 52.20 | 50.60 / 50.91 / 50.91 | 68.34 / 68.70 / 68.70 | 74.35 / 75.10 / 75.10 |
| Warm repeated requests | 5.70 / 5.70 / 5.70 | 5.18 / 6.83 / 6.83 | 6.96 / 8.48 / 8.48 | 12.84 / 15.04 / 15.04 | 25.34 / 30.26 / 30.26 |
| Mixed distinct and identical keys | 50.21 / 50.21 / 50.21 | 49.03 / 63.62 / 63.62 | 48.94 / 78.67 / 78.67 | 65.50 / 95.96 / 95.96 | 67.17 / 98.07 / 98.07 |
| Provider delay, 120 ms per operation | 379.88 / 379.88 / 379.88 | 377.26 / 501.17 / 501.17 | 382.43 / 634.06 / 634.06 | 276.67 / 627.87 / 627.87 | 375.98 / 642.93 / 642.93 |
| Provider failure (mock 503 responses) | 51.27 / 51.27 / 51.27 | 52.46 / 56.48 / 56.48 | 58.46 / 68.15 / 68.15 | 100.62 / 125.27 / 125.27 | 203.24 / 235.18 / 235.18 |

The first cold request includes first-request runtime overhead. Application/database initialization happened before timing. Metrics were enabled for these mocked-provider measurements.

## Queue saturation

The saturation workload used 16 distinct requests. Normalization and Foursquare mocks used 5 ms delays; menu-generation mocks used 900 ms delays.

| Measurement | Result |
|---|---:|
| Endpoint sample size | 16 |
| Client endpoint P50 / P95 / maximum | 150.18 / 1,845.43 / 1,845.43 ms |
| Server response-finish P50 / P95 / maximum | 101.85 / 1,838.98 / 1,838.98 ms |
| Maximum active menu operations | 4 |
| Maximum pending menu tasks | 8 |
| Menu provider operations started | 8 |
| Queue-full rejections | 52 |
| Queue timeouts | 4 |
| SQLite fallback responses | 14 |
| Queue-wait P50 / P95 / maximum | 0 / 1,500.80 / 1,501.57 ms |

The observed timeout can exceed the configured 1,500 ms slightly because timers execute when the event loop schedules them; it is not a hard real-time deadline.

## Concurrency, cache, and provider observations at 16 requests

| Workload | Provider operations: normalization / Foursquare / menu | Single-flight observations | Cache observations | Rejected / timed out | Local fallbacks |
|---|---:|---|---|---:|---:|
| Cold distinct success | 16 / 16 / 12 | Leaders 16 / 16 / 64; no joiners | Misses: normalization 16, geo 16, generated menu 64 | 52 / 0 | 13 |
| Identical requests | 1 / 1 / 4 | Joiners: normalization 15, restaurant search 15, menu generation 60 | All simultaneous lookups missed before shared results completed | 0 / 0 | 0 |
| Warm repeated | 0 / 0 / 0 | No single-flight work needed | Hits: normalization 16, geo 16, generated menu 64 | 0 / 0 | 0 |
| Mixed, four distinct keys | 4 / 4 / 12 | Joiners: normalization 12, restaurant search 12, menu generation 48 | Initial misses; matched-menu cache also used for fallback | 4 / 0 | 4 |
| 120 ms provider delay | 16 / 16 / 12 | Distinct query leaders; no joiners | Cold misses | 52 / 0 | 13 |
| Provider failure | 16 / 16 / 12 attempted; attempts returned no result | Distinct query leaders; no joiners | Cold misses | 52 / 0 | 16 |
| Queue saturation | 16 / 16 / 8 | Distinct query leaders; no joiners | Cold misses | 52 / 4 | 14 |

A separate active-operation probe observed up to 19 simultaneous mocked provider operations overall at 16-request concurrency, including normalization and Foursquare. The menu limiter itself remained at or below four; normalization and restaurant search are not covered by that limiter.

For the identical-request workload, one normalization call and one Foursquare search served the group; four menu calls served the four restaurants. The 15, 15, and 60 single-flight joins did not create additional provider calls. For warm requests, all three relevant caches hit and no provider call started.

## Stage timings and server finish at 16 requests

P50 / P95 milliseconds from per-request traces. SQLite values apply to fallback requests only; immediate queue rejections can make menu-stage medians small even when a subset of requests waits much longer.

| Workload | Response finish | Normalization | Restaurant search | Menu generation | SQLite matching |
|---|---:|---:|---:|---:|---:|
| Cold distinct success | 85.77 / 164.57 | 20.51 / 21.44 | 43.11 / 93.42 | 0.22 / 126.16 | 5.33 / 7.39 |
| Identical requests | 66.02 / 67.34 | 24.15 / 25.72 | 15.32 / 15.40 | 16.29 / 16.49 | — |
| Warm repeated | 0.78 / 1.59 | 0.04 / 0.11 | 0.01 / 0.02 | 0.04 / 0.37 | — |
| Mixed | 60.38 / 91.27 | 23.88 / 25.03 | 15.93 / 16.09 | 16.88 / 47.04 | 0.00 / 7.78 |
| 120 ms provider delay | 320.79 / 635.99 | 131.75 / 134.10 | 160.72 / 222.91 | 0.25 / 374.83 | 6.67 / 9.90 |
| Provider failure | 135.04 / 230.43 | 11.01 / 11.59 | 76.81 / 174.80 | 0.25 / 186.10 | 7.05 / 9.34 |
| Queue saturation | 101.85 / 1,838.98 | 8.05 / 8.17 | 50.23 / 126.36 | 0.26 / 1,812.84 | 7.40 / 11.76 |

## Correctness observations

The harness reported HTTP 200 for expected success and overload outcomes, unchanged response keys, and correct echoed normalized intent. It observed zero duplicate menu starts for the same key. No active-slot leaks remained after workloads. These results validate the mocked local scenarios only.

## Environment caveat

An earlier verification command in the development worktree may have written synthetic test data to the ignored persistent SQLite database. It was not restored because no pre-test snapshot was available. The current test reruns and the documented end-to-end benchmarks use `DATABASE_PATH=:memory:`; do not publish or replace the local database as part of these changes.
