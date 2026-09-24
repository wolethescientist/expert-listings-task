import assert from 'node:assert/strict';
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../src/app.js';

const testUrl = process.env.TEST_DATABASE_URL ?? 'postgres://listings:listings@localhost:5433/listings_test';
if (!testUrl.includes('listings_test')) throw new Error('TEST_DATABASE_URL must point to a listings_test database');
const pool = new pg.Pool({ connectionString: testUrl });
let app: FastifyInstance;

const agentId = '11111111-1111-4111-8111-111111111111';
const listing = (overrides: Record<string, unknown> = {}) => ({
  title: 'Lekki apartment',
  price: 50000000,
  type: 'sale',
  bedrooms: 3,
  location: { address: 'Lekki Phase 1, Lagos', lat: 6.4474, lng: 3.4737 },
  agentId,
  ...overrides,
});

async function create(payload = listing()) {
  const response = await app.inject({ method: 'POST', url: '/listings', payload });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().data;
}

before(async () => {
  const sql = await readFile(new URL('../migrations/001_create_listings.sql', import.meta.url), 'utf8');
  await pool.query(sql);
  app = buildApp(pool, { logger: false });
  await app.ready();
});

beforeEach(async () => {
  await pool.query('DELETE FROM listings');
});

after(async () => {
  if (app) await app.close();
  await pool.end();
});

test('creates, reads, updates, lists, and deletes a listing', async () => {
  const created = await create();
  assert.equal(created.price, 50000000);
  assert.equal(created.location.lat, 6.4474);

  const read = await app.inject({ method: 'GET', url: `/listings/${created.id}` });
  assert.equal(read.statusCode, 200);
  assert.equal(read.json().data.title, 'Lekki apartment');

  const updated = await app.inject({ method: 'PATCH', url: `/listings/${created.id}`, payload: { price: 45000000, bedrooms: 4 } });
  assert.equal(updated.statusCode, 200, updated.body);
  assert.equal(updated.json().data.price, 45000000);
  assert.equal(updated.json().data.bedrooms, 4);

  const list = await app.inject({ method: 'GET', url: '/listings' });
  assert.equal(list.json().pagination.total, 1);
  assert.equal(list.json().data[0].id, created.id);

  const deleted = await app.inject({ method: 'DELETE', url: `/listings/${created.id}` });
  assert.equal(deleted.statusCode, 204);
  const missing = await app.inject({ method: 'GET', url: `/listings/${created.id}` });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json().error.code, 'LISTING_NOT_FOUND');
});

test('search combines radius, type, price, and bedroom filters', async () => {
  const wanted = await create();
  await create(listing({ title: 'Nearby rental', type: 'rent' }));
  await create(listing({ title: 'Expensive sale', price: 90000000 }));
  await create(listing({ title: 'Abuja sale', location: { address: 'Abuja', lat: 9.0765, lng: 7.3986 } }));

  const response = await app.inject({ method: 'GET', url: '/listings/search?lat=6.4474&lng=3.4737&radiusKm=5&type=sale&minPrice=40000000&maxPrice=60000000&bedrooms=3' });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().pagination.total, 1);
  assert.equal(response.json().data[0].id, wanted.id);
  assert.equal(response.json().data[0].distanceKm, 0);
});

test('search includes a listing on the radius boundary and excludes one outside it', async () => {
  await create();
  await create(listing({ title: 'One degree away', location: { address: 'North', lat: 7.4474, lng: 3.4737 } }));

  const near = await app.inject({ method: 'GET', url: '/listings/search?lat=6.4474&lng=3.4737&radiusKm=111.196' });
  assert.equal(near.statusCode, 200, near.body);
  assert.equal(near.json().pagination.total, 2);
  assert.ok(near.json().data[1].distanceKm <= 111.196);

  const smaller = await app.inject({ method: 'GET', url: '/listings/search?lat=6.4474&lng=3.4737&radiusKm=111' });
  assert.equal(smaller.json().pagination.total, 1);
});

test('pagination has a total count and stable, non-overlapping pages', async () => {
  await create(listing({ title: 'First' }));
  await create(listing({ title: 'Second' }));
  await create(listing({ title: 'Third' }));
  const first = (await app.inject({ method: 'GET', url: '/listings?page=1&limit=2' })).json();
  const second = (await app.inject({ method: 'GET', url: '/listings?page=2&limit=2' })).json();
  assert.deepEqual(first.pagination, { page: 1, limit: 2, total: 3, totalPages: 2 });
  assert.equal(first.data.length, 2);
  assert.equal(second.data.length, 1);
  assert.ok(!first.data.some((item: { id: string }) => item.id === second.data[0].id));
});

test('search paginates nearest listings first', async () => {
  const closest = await create();
  await create(listing({ title: 'North', location: { address: 'North', lat: 6.4574, lng: 3.4737 } }));
  const farther = await create(listing({ title: 'Farther north', location: { address: 'Farther north', lat: 6.4674, lng: 3.4737 } }));

  const first = (await app.inject({ method: 'GET', url: '/listings/search?lat=6.4474&lng=3.4737&radiusKm=5&page=1&limit=2' })).json();
  const second = (await app.inject({ method: 'GET', url: '/listings/search?lat=6.4474&lng=3.4737&radiusKm=5&page=2&limit=2' })).json();
  assert.deepEqual(first.pagination, { page: 1, limit: 2, total: 3, totalPages: 2 });
  assert.equal(first.data[0].id, closest.id);
  assert.equal(second.data[0].id, farther.id);
  assert.ok(first.data[1].distanceKm < second.data[0].distanceKm);
});

test('rejects malformed input, impossible filters, and unknown resources', async () => {
  const badBody = await app.inject({ method: 'POST', url: '/listings', payload: listing({ price: -1 }) });
  assert.equal(badBody.statusCode, 400);
  assert.equal(badBody.json().error.code, 'VALIDATION_ERROR');

  const badCoordinates = await app.inject({ method: 'GET', url: '/listings/search?lat=91&lng=3&radiusKm=5' });
  assert.equal(badCoordinates.statusCode, 400);

  const badRange = await app.inject({ method: 'GET', url: '/listings/search?lat=6&lng=3&radiusKm=5&minPrice=100&maxPrice=50' });
  assert.equal(badRange.statusCode, 400);
  assert.equal(badRange.json().error.code, 'INVALID_PRICE_RANGE');

  const invalidId = await app.inject({ method: 'GET', url: '/listings/not-a-uuid' });
  assert.equal(invalidId.statusCode, 400);

  const malformedJson = await app.inject({ method: 'POST', url: '/listings', headers: { 'content-type': 'application/json' }, payload: '{' });
  assert.equal(malformedJson.statusCode, 400);
  assert.equal(malformedJson.json().error.code, 'REQUEST_ERROR');

  const missing = await app.inject({ method: 'PATCH', url: '/listings/00000000-0000-4000-8000-000000000000', payload: { title: 'Changed' } });
  assert.equal(missing.statusCode, 404);
});
