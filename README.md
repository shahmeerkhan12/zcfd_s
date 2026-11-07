# 🥄 Spoon: Zero-Click Food Delivery

> Describe a craving. Get dinner.

Spoon is an AI-powered food delivery demo built for a hackathon. Instead of browsing menus, you type what you feel like eating, even with typos or on the wrong keyboard layout. An LLM pipeline understands the request, finds restaurants nearby, generates menus that fit, and lets you place and track an order.

> **Demo only.** Payments, couriers and tracking are simulated. No card details are collected and no money is charged.

## Features

- **Natural-language ordering.** Type something like `spicy chicken under $15` and get matching dishes.
- **Robust input handling.** The LLM repairs typos, garbled (mojibake) text and wrong keyboard layouts, then extracts category, dietary tags, budget and speed preference.
- **Live restaurant discovery.** Geo-search around Kyiv via Foursquare, with map-ready coordinates.
- **AI-generated menus.** Realistic menus for up to four discovered restaurants, generated in parallel and saved so they can be ordered.
- **Order tracking.** Orders get a tracking number (`SPN-XXXXXX`) and move through `placed → cooking → on the way → delivered`.
- **Works without API keys.** Every layer has a fallback, so the demo runs fully offline.

## How it works

```
Prompt ─► 1. Normalize ─► 2. Discover ─► 3. Generate menus ─► 4. Order & track
          (LLM / regex)   (Foursquare /   (LLM / SQLite        (SQLite, simulated
                           local SQLite)   keyword match)       courier status)
```

| Layer | Primary | Fallback |
|---|---|---|
| Query understanding | Groq → Gemini → OpenAI | Regex normalizer |
| Restaurant search | Foursquare | Local SQLite with Kyiv coordinates |
| Menus | LLM-generated per restaurant | SQLite keyword matching |

Stages 1 and 2 run sequentially because each uses the previous output. Menu generation runs in parallel, capped at four restaurants per request.

## Tech stack

| Area | Tools |
|---|---|
| Client | React 19, Redux Toolkit, Vite, Tailwind CSS 4 |
| Server | Node.js, Express 5 |
| Data | SQLite (`node:sqlite`) with SQL migrations |
| AI | Groq (`openai/gpt-oss-20b`), Gemini (`gemini-2.0-flash`), OpenAI (`gpt-4o-mini`) |
| Places | Foursquare Places API |

## Getting started

### Prerequisites

- Node.js 22.5 or newer (the server uses the built-in `node:sqlite` module)
- npm

### 1. Configure the server

```sh
cd server
cp .env.example .env
```

Edit `.env` and add any keys you have. All of them are optional.

| Variable | Purpose |
|---|---|
| `PORT` | API port (default `3000`) |
| `GROQ_API_KEY` | Primary LLM provider (free tier) |
| `GEMINI_API_KEY` | Second choice LLM provider (free tier) |
| `OPENAI_API_KEY` | Backup LLM provider |
| `FOURSQUARE_API_KEY` | Live restaurant search. Leave blank to use the local Kyiv dataset |
| `DATABASE_PATH` | SQLite file location (default `server/data/food-delivery.sqlite`) |
| `PERF_METRICS` | Set to `1` to enable internal performance traces |

### 2. Run the API

```sh
cd server
npm install
npm run dev
```

### 3. Run the client

In a second terminal:

```sh
cd client
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Vite proxies `/api` to the Express server on port 3000.

## API reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/restaurants?lat=&lng=&q=` | Full pipeline: intent, restaurants, generated menu items and map markers |
| `GET` | `/api/restaurants/feed` | Lightweight feed of available dishes, with ETag support for polling |
| `GET` | `/api/suggestions` | Keyword-matched dishes from the local menu |
| `POST` | `/api/llm/normalize` | Normalize raw user text into a structured intent |
| `POST` | `/api/orders` | Create an order (`itemId`, `customerName`, `address`, `paymentMethod`) |
| `GET` | `/api/orders/:trackingNumber` | Get order status |

Example response shape for `/api/restaurants`:

```json
{
  "restaurants": [{ "id": "…", "name": "…", "lat": 50.45, "lng": 30.52 }],
  "items": [{ "id": "…", "name": "…", "restaurant": "…", "price": 12.5 }],
  "markers": [{ "name": "…", "lat": 50.45, "lng": 30.52 }],
  "intent": { "cleanQuery": "spicy chicken", "category": "chicken", "dietary": ["spicy"], "maxBudget": 15, "speedPriority": false },
  "menuSource": "llm",
  "source": "foursquare",
  "cached": false
}
```

## Performance engineering

The backend AI pipeline is built to stay fast and predictable under load:

- **Complete cache keys.** Keys cover the full query, restaurant metadata and result limit, so different requests never share a wrong result.
- **Single-flight deduplication.** Identical concurrent requests share one pending provider call.
- **Bounded concurrency.** A FIFO limiter allows 4 active and 8 queued menu-generation calls with a 1.5 s queue timeout. Overflow falls back to SQLite matching.
- **Observability.** `PERF_METRICS=1` records stage timings, cache hits, single-flight joins and queue events. It never logs prompts, credentials or customer data.

Benchmarks used mocked providers and in-memory SQLite. Real provider latency has not been measured yet. Details are in [`docs/performance-engineering`](./docs/performance-engineering):

- [Benchmark results](./docs/performance-engineering/benchmark-results.md)
- [Optimization history](./docs/performance-engineering/optimization-history.md)
- [Architecture decisions](./docs/performance-engineering/architecture-decisions.md)

## Testing

```sh
# server (use an in-memory database so your local data stays untouched)
cd server
DATABASE_PATH=:memory: node --experimental-sqlite --test --test-concurrency=1

# client
cd client
npm run lint
npm run build
```

## Project structure

```
.
├── client/                  # React + Vite frontend
│   └── src/
│       ├── features/        # order-by-prompt, order-status
│       ├── entities/        # order, restaurant, user (Redux slices)
│       └── pages/           # HomePage
├── server/                  # Express API
│   ├── src/modules/         # llm, restaurants, orders, suggestions
│   ├── src/shared/          # TTL cache, single-flight, concurrency limiter, metrics
│   ├── src/database/        # SQLite setup and migrations
│   ├── data-mock/           # Seed menu data
│   └── test/                # Node test runner suites
└── docs/performance-engineering/
```

## Known limitations

- Payment, courier and delivery status are simulated.
- Caches and the concurrency limiter are process-local and not shared across server instances.
- Shared provider work is not cancelled when a client disconnects.
- Concurrency limits (4 active, 8 queued) are experimental defaults, not tuned against real provider quotas.

## Roadmap

- Benchmark real Groq, Gemini, OpenAI and Foursquare latency
- Real payment and courier integrations
- Shared cache and rate limiting across instances

## Team

Built at a hackathon by Lada Koicheva, Abdullah, Arshad and Egor Zhmurov.

## License

No license file is included yet. Add one (for example MIT) before sharing the project publicly.
