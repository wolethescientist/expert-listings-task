import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pagination } from '../src/pagination.js';
import { toListing } from '../src/types.js';
import type { ListingRow } from '../src/types.js';

const row: ListingRow = {
  id: '22222222-2222-4222-8222-222222222222',
  title: 'Test listing',
  price: '1000000000000',
  type: 'sale',
  bedrooms: 3,
  location_text: 'Lekki, Lagos',
  latitude: 6.4474,
  longitude: 3.4737,
  agent_id: '11111111-1111-4111-8111-111111111111',
  created_at: new Date('2026-09-24T10:00:00.000Z'),
  updated_at: new Date('2026-09-24T11:00:00.000Z'),
};

test('pagination reports zero pages for an empty collection', () => {
  assert.deepEqual(pagination(1, 20, 0), { page: 1, limit: 20, total: 0, totalPages: 0 });
});

test('pagination rounds up a partially filled last page', () => {
  assert.deepEqual(pagination(2, 20, 21), { page: 2, limit: 20, total: 21, totalPages: 2 });
});

test('listing serialization preserves a large safe price and maps database fields', () => {
  const listing = toListing(row);
  assert.equal(listing.price, 1000000000000);
  assert.deepEqual(listing.location, { address: 'Lekki, Lagos', lat: 6.4474, lng: 3.4737 });
  assert.equal(listing.agentId, row.agent_id);
  assert.equal(listing.createdAt, '2026-09-24T10:00:00.000Z');
  assert.ok(!('distanceKm' in listing));
});

test('search listing serialization rounds displayed distance to three decimals', () => {
  const listing = toListing({ ...row, distance_km: 1.23456 });
  assert.equal(listing.distanceKm, 1.235);
});
