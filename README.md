# Property Listings API

A small Node.js/TypeScript REST API for the Expert Listing backend task. It provides listing CRUD, paginated listing and geospatial search, validation, consistent errors, and integration tests.

The listing API is versioned under `/api/v1`. Breaking API changes can be introduced under a future `/api/v2` prefix. `/health` is unversioned because it reports process status rather than a listing resource.

## Requirements

- Node.js 22 or newer and npm
- Docker with Compose for PostgreSQL (or an existing PostgreSQL 17 database)

## Run locally

```bash
cp .env.example .env
npm ci
docker compose up -d db
npm run db:migrate
npm run dev
```

The API listens on `http://localhost:3000`. Check `GET /health` to confirm it is running. To run the app and database entirely in containers, use `docker compose --profile app up --build` instead; the app container applies the idempotent migration at startup.

To run tests, start the separate test database and run:

```bash
docker compose up -d db-test
npm test
```

`TEST_DATABASE_URL` must point to a database named `listings_test`. Tests clear its `listings` table between cases. CI runs the same type check, build, and test commands against a PostgreSQL service.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/listings` | Create a listing |
| `GET` | `/api/v1/listings` | List listings, newest first |
| `GET` | `/api/v1/listings/:id` | Get one listing |
| `PATCH` | `/api/v1/listings/:id` | Update supplied fields |
| `DELETE` | `/api/v1/listings/:id` | Delete a listing |
| `GET` | `/api/v1/listings/search` | Search and sort by distance |
| `GET` | `/health` | Process health check |

Create a listing:

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

`price` is a non-negative whole number in Nigerian naira. `type` is `rent`, `sale`, or `shortlet`. The address is free text; `lat` and `lng` are decimal degrees. `agentId` is a UUID. `PATCH` accepts any non-empty subset of the listing fields; if `location` is supplied, include all three location fields.

Search within 5 km of a point, with optional filters:

```bash
curl 'http://localhost:3000/api/v1/listings/search?lat=6.4474&lng=3.4737&radiusKm=5&type=sale&minPrice=40000000&maxPrice=60000000&bedrooms=3&page=1&limit=20'
```

`lat`, `lng`, and `radiusKm` are required for search. `type`, `minPrice`, `maxPrice`, and `bedrooms` are optional. Price bounds and the radius are inclusive; bedrooms is an exact match. Results are sorted by distance ascending, then ID for a stable tie break. Search results include `distanceKm`, rounded to three decimals for display. The radius comparison uses the unrounded distance.

Both `GET /api/v1/listings` and search accept `page` (default `1`) and `limit` (default `20`, maximum `100`). They return:

```json
{
  "data": [],
  "pagination": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 }
}
```

Single-listing responses use `{ "data": { ... } }`. `POST` returns `201` and a `Location` header; `DELETE` returns `204`. Errors use `{ "error": { "code": "...", "message": "..." } }`. Invalid input returns `400`, missing listings return `404`, and unexpected failures return `500` without exposing internal details.

## Design choices

- PostgreSQL stores listing fields with database checks as a second line of validation. `agentId` is stored as an ID because the task does not define an agents API or authentication model.
- Fastify JSON Schema validates request bodies, path parameters, and query strings. Unknown fields are rejected. SQL values are parameterized.
- Search calculates great-circle distance with the Haversine formula using Earth's mean radius of 6,371.0088 km. This keeps the exercise self-contained without requiring a PostgreSQL extension. Search and list queries use deterministic ordering.
- The code separates HTTP routes, validation schemas, database queries, and serialization. Tests send HTTP requests through Fastify and use a real, separate PostgreSQL database.

## With more time

- Add authentication and authorization so agents can manage only their own listings.
- Add currency and rental billing period fields; the task does not define these.
- Use PostGIS with a spatial index for large datasets and add query performance benchmarks.
- Generate an OpenAPI specification and add deployment health/readiness checks.
- For very large result sets, consider cursor pagination and a single-snapshot strategy for rows and counts under concurrent writes.
