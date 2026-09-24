import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const baseUrl = new URL(process.env.BASE_URL ?? 'http://localhost:3000');
const samples = Number(process.env.SMOKE_SAMPLES ?? 30);
assert.ok(Number.isInteger(samples) && samples >= 1 && samples <= 50, 'SMOKE_SAMPLES must be an integer from 1 to 50');

const timings = new Map();
const createdIds = new Set();
const latitude = Number((6.3 + Math.random() * 0.1).toFixed(6));
const longitude = Number((3.3 + Math.random() * 0.1).toFixed(6));

async function request(label, method, path, expectedStatus, body, verify) {
  const start = performance.now();
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  const elapsedMs = performance.now() - start;
  assert.equal(response.status, expectedStatus, `${label}: ${text}`);
  const data = response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : undefined;
  verify?.({ response, text, data });
  if (!timings.has(label)) timings.set(label, []);
  timings.get(label).push(elapsedMs);
  return { response, text, data };
}

function summary(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
  return { median: median.toFixed(2), p95: p95.toFixed(2) };
}

try {
  await fetch(new URL('/health', baseUrl), { signal: AbortSignal.timeout(10000) }).then((response) => response.text());

  for (let index = 0; index < samples; index++) {
    const payload = {
      title: `Smoke listing ${randomUUID()}`,
      price: 50000000,
      type: 'sale',
      bedrooms: 3,
      location: { address: 'Smoke test point, Lagos', lat: latitude, lng: longitude },
      agentId: '11111111-1111-4111-8111-111111111111',
    };
    await request('POST /api/v1/listings', 'POST', '/api/v1/listings', 201, payload, ({ response, data }) => {
      if (data?.data?.id) createdIds.add(data.data.id);
      assert.equal(data.data.title, payload.title);
      assert.equal(response.headers.get('location'), `/api/v1/listings/${data.data.id}`);
    });
  }

  const ids = [...createdIds];
  const lastId = ids.at(-1);
  const search = `/api/v1/listings/search?lat=${latitude}&lng=${longitude}&radiusKm=0.05&type=sale&minPrice=40000000&maxPrice=60000000&bedrooms=3&limit=100`;

  for (let index = 0; index < samples; index++) {
    await request('GET /api/v1/listings', 'GET', '/api/v1/listings?limit=100', 200, undefined, ({ data }) => {
      assert.ok(data.data.some((item) => item.id === lastId));
    });
    await request('GET /api/v1/listings/:id', 'GET', `/api/v1/listings/${lastId}`, 200, undefined, ({ data }) => {
      assert.equal(data.data.id, lastId);
    });
    await request('PATCH /api/v1/listings/:id', 'PATCH', `/api/v1/listings/${lastId}`, 200, { title: `Smoke updated ${index}` }, ({ data }) => {
      assert.equal(data.data.title, `Smoke updated ${index}`);
    });
    await request('GET /api/v1/listings/search', 'GET', search, 200, undefined, ({ data }) => {
      assert.ok(data.data.some((item) => item.id === lastId && item.distanceKm === 0));
    });
    await request('GET /health', 'GET', '/health', 200, undefined, ({ data }) => {
      assert.equal(data.status, 'ok');
    });
    await request('GET /docs/', 'GET', '/docs/', 200, undefined, ({ text }) => {
      assert.match(text, /Swagger UI/);
    });
    await request('GET /docs/json', 'GET', '/docs/json', 200, undefined, ({ data }) => {
      assert.equal(data.openapi, '3.0.3');
      assert.ok(data.paths['/api/v1/listings/search']);
    });
    await request('GET /docs/yaml', 'GET', '/docs/yaml', 200, undefined, ({ text }) => {
      assert.match(text, /openapi: 3\.0\.3/);
    });
  }

  for (const id of ids) {
    await request('DELETE /api/v1/listings/:id', 'DELETE', `/api/v1/listings/${id}`, 204);
    createdIds.delete(id);
  }

  const deleted = await fetch(new URL(`/api/v1/listings/${lastId}`, baseUrl), { signal: AbortSignal.timeout(10000) });
  assert.equal(deleted.status, 404, 'Deleted listing should no longer be found');
  await deleted.text();

  console.log(`Target: ${baseUrl.origin}`);
  console.log(`Measured: ${new Date().toISOString()}`);
  console.log(`Method: ${samples} sequential requests per route; client timer includes the full response body. Temporary listings were deleted.`);
  console.log('| Endpoint | Status | Samples | Median (ms) | p95 (ms) |');
  console.log('| --- | ---: | ---: | ---: | ---: |');
  for (const [label, values] of timings) {
    const { median, p95 } = summary(values);
    const status = label.startsWith('POST') ? 201 : label.startsWith('DELETE') ? 204 : 200;
    console.log(`| \`${label}\` | ${status} | ${values.length} | ${median} | ${p95} |`);
  }
} finally {
  for (const id of createdIds) {
    try {
      await fetch(new URL(`/api/v1/listings/${id}`, baseUrl), { method: 'DELETE', signal: AbortSignal.timeout(10000) });
    } catch {
      // Preserve the original failure while making a best-effort cleanup.
    }
  }
}
