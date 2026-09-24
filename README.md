# Property Listings API

[![CI](https://github.com/wolethescientist/expert-listings-task/actions/workflows/ci.yml/badge.svg)](https://github.com/wolethescientist/expert-listings-task/actions/workflows/ci.yml)

A versioned REST API for property listings, built with **Node.js, TypeScript, Fastify, and PostgreSQL**. It supports CRUD, geographic search with filters, pagination, request validation, and interactive OpenAPI documentation.

**Explore locally:** [Swagger UI](http://localhost:3000/docs/) · [OpenAPI JSON](http://localhost:3000/docs/json) · [OpenAPI YAML](http://localhost:3000/docs/yaml)

## Quick start

Run the API and PostgreSQL together with Docker:

```bash
docker compose --profile app up -d --build
```

Open [http://localhost:3000/docs/](http://localhost:3000/docs/). The app container waits for PostgreSQL and applies the idempotent migration before starting. Swagger UI includes a ready-to-use create-listing example; select **Try it out**, then **Execute**.

For local development with Node.js 22 or newer:

```bash
cp .env.example .env
npm ci
docker compose up -d db
npm run db:migrate
npm run dev
```

The API listens on port `3000`. `GET /health` reports process status. The database runs on port `5432`; the separate test database runs on port `5433` when started.

## API reference

All listing routes use the `/api/v1` prefix. `/health` and documentation routes are unversioned.

| Method | Route | Result |
| --- | --- | --- |
| `POST` | `/api/v1/listings` | Create a listing; `201` and a `Location` header |
| `GET` | `/api/v1/listings` | List listings, newest first |
| `GET` | `/api/v1/listings/:id` | Read a listing |
| `PATCH` | `/api/v1/listings/:id` | Update one or more fields |
| `DELETE` | `/api/v1/listings/:id` | Delete a listing; `204` |
| `GET` | `/api/v1/listings/search` | Search by distance and optional filters |
| `GET` | `/health` | Process health check |
| `GET` | `/docs/` | Interactive Swagger UI |
| `GET` | `/docs/json`, `/docs/yaml` | Generated OpenAPI 3 specification |

### Create a listing

```bash
curl -X POST http://localhost:3000/api/v1/listings \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Three-bedroom apartment in Lekki",
    "price": 50000000,
    "type": "sale",
    "bedrooms": 3,
    "location": { "address": "Lekki Phase 1, Lagos", "lat": 6.4474, "lng": 3.4737 },
    "agentId": "11111111-1111-4111-8111-111111111111"
  }'
```

`price` is a whole number in Nigerian naira. `type` is `rent`, `sale`, or `shortlet`. Coordinates are decimal degrees. `agentId` is a UUID. A `PATCH` body may contain any non-empty subset of listing fields; a location update must supply `address`, `lat`, and `lng` together.

### Search nearby listings

```bash
curl 'http://localhost:3000/api/v1/listings/search?lat=6.4474&lng=3.4737&radiusKm=5&type=sale&minPrice=40000000&maxPrice=60000000&bedrooms=3&page=1&limit=20'
```

| Parameter | Rule |
| --- | --- |
| `lat`, `lng`, `radiusKm` | Required. Latitude: −90 to 90; longitude: −180 to 180; radius: greater than 0 and at most 20,000 km. |
| `type` | Optional: `rent`, `sale`, or `shortlet`. |
| `minPrice`, `maxPrice` | Optional inclusive bounds; `minPrice` must not exceed `maxPrice`. |
| `bedrooms` | Optional exact match. |
| `page`, `limit` | Optional on list and search. Defaults: page `1`, limit `20`; limit maximum `100`. |

Search results within the radius are ordered by distance, then ID. Each result includes `distanceKm`, rounded to three decimals for display. The radius filter uses the unrounded distance. List and search responses include `data` and `pagination` (`page`, `limit`, `total`, `totalPages`).

Invalid input returns `400`, an unknown listing returns `404`, and unexpected failures return `500`. Errors use `{ "error": { "code": "...", "message": "..." } }`; internal details are not returned to clients.

## Verification

### Automated tests

Start the isolated PostgreSQL test database, then run the suites separately or together:

```bash
docker compose up -d db-test
npm run test:unit
npm run test:integration
npm test
```

| Suite | Result | What it covers |
| --- | ---: | --- |
| [Unit tests](tests/unit.test.ts) | **4 passed / 4** | Empty and partial pagination, large price serialization, geographic distance display rounding. |
| [Integration tests](tests/api.test.ts) | **9 passed / 9** | CRUD, v1 routing, Swagger/OpenAPI, combined filters, location changes, radius boundaries, pagination, malformed input, and errors against a real PostgreSQL test database. |

The integration suite uses `listings_test` and clears its listing table between cases. The CI workflow runs type checking, a build, and both suites.

### Endpoint checks and response times

Run `npm run smoke` while the app is running. The [smoke script](scripts/smoke.mjs) calls every public route, verifies status and response content, confirms deletion, and removes its temporary listings. Set `BASE_URL` to test another deployment, or `SMOKE_SAMPLES` to change the sample count.

The following results were measured on **24 September 2026 at 20:50 UTC** against the local Docker app (Node.js 22) and PostgreSQL 17. Each route received **30 sequential requests**. Timings are client-observed round trips in milliseconds, including the full response body. They are a local snapshot, not a production load benchmark.

| Endpoint | Status | Requests | Median | p95 |
| --- | ---: | ---: | ---: | ---: |
| `POST /api/v1/listings` | 201 | 30 | 3.59 ms | 23.45 ms |
| `GET /api/v1/listings` | 200 | 30 | 4.11 ms | 7.62 ms |
| `GET /api/v1/listings/:id` | 200 | 30 | 3.03 ms | 5.79 ms |
| `PATCH /api/v1/listings/:id` | 200 | 30 | 3.90 ms | 8.07 ms |
| `DELETE /api/v1/listings/:id` | 204 | 30 | 3.53 ms | 6.58 ms |
| `GET /api/v1/listings/search` | 200 | 30 | 4.63 ms | 8.25 ms |
| `GET /health` | 200 | 30 | 2.30 ms | 3.57 ms |
| `GET /docs/` | 200 | 30 | 2.25 ms | 4.25 ms |
| `GET /docs/json` | 200 | 30 | 2.51 ms | 4.32 ms |
| `GET /docs/yaml` | 200 | 30 | 2.69 ms | 5.63 ms |

## Design choices

- **Validation and errors:** Fastify JSON Schema validates bodies, paths, and queries. Unknown fields are rejected; the database has matching constraints as a second check.
- **Data access:** PostgreSQL queries are parameterized. `agentId` is stored as an ID because the exercise does not define agents or authentication.
- **Geographic search:** The SQL query uses the Haversine formula with Earth's mean radius of 6,371.0088 km. This keeps setup simple for a small dataset; list and search results use deterministic ordering.
- **Documentation:** Swagger UI and the OpenAPI document are generated from the route schemas used by the running API.
- **Money:** The task does not define currencies or billing periods, so `price` is an integer in naira. The accepted range is capped below JavaScript's safe integer limit.
