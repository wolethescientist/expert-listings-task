import type pg from 'pg';
import type { ListingInput, ListingPatch, ListingRow, SearchQuery } from './types.js';

const columns = 'id, title, price, type, bedrooms, location_text, latitude, longitude, agent_id, created_at, updated_at';

export async function createListing(pool: pg.Pool, input: ListingInput): Promise<ListingRow> {
  const result = await pool.query<ListingRow>(
    `INSERT INTO listings (title, price, type, bedrooms, location_text, latitude, longitude, agent_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${columns}`,
    [input.title.trim(), input.price, input.type, input.bedrooms,
      input.location.address.trim(), input.location.lat, input.location.lng, input.agentId],
  );
  return result.rows[0]!;
}

export async function getListing(pool: pg.Pool, id: string): Promise<ListingRow | undefined> {
  const result = await pool.query<ListingRow>(`SELECT ${columns} FROM listings WHERE id = $1`, [id]);
  return result.rows[0];
}

export async function listListings(pool: pg.Pool, page: number, limit: number) {
  const offset = (page - 1) * limit;
  const count = await pool.query<{ count: string }>('SELECT count(*) FROM listings');
  const result = await pool.query<ListingRow>(
    `SELECT ${columns} FROM listings ORDER BY created_at DESC, id DESC LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return { rows: result.rows, total: Number(count.rows[0]!.count) };
}

export async function updateListing(pool: pg.Pool, id: string, patch: ListingPatch): Promise<ListingRow | undefined> {
  const assignments: string[] = [];
  const values: unknown[] = [];
  const add = (column: string, value: unknown) => {
    values.push(value);
    assignments.push(`${column} = $${values.length}`);
  };

  if (patch.title !== undefined) add('title', patch.title.trim());
  if (patch.price !== undefined) add('price', patch.price);
  if (patch.type !== undefined) add('type', patch.type);
  if (patch.bedrooms !== undefined) add('bedrooms', patch.bedrooms);
  if (patch.location !== undefined) {
    add('location_text', patch.location.address.trim());
    add('latitude', patch.location.lat);
    add('longitude', patch.location.lng);
  }
  if (patch.agentId !== undefined) add('agent_id', patch.agentId);

  values.push(id);
  const result = await pool.query<ListingRow>(
    `UPDATE listings SET ${assignments.join(', ')}, updated_at = now()
     WHERE id = $${values.length} RETURNING ${columns}`,
    values,
  );
  return result.rows[0];
}

export async function deleteListing(pool: pg.Pool, id: string): Promise<boolean> {
  const result = await pool.query('DELETE FROM listings WHERE id = $1', [id]);
  return result.rowCount === 1;
}

export async function searchListings(pool: pg.Pool, query: SearchQuery, page: number, limit: number) {
  const values: unknown[] = [query.lat, query.lng, query.radiusKm];
  const conditions = ['distance_km <= $3'];
  const addFilter = (sql: string, value: unknown) => {
    values.push(value);
    conditions.push(sql.replace('?', `$${values.length}`));
  };

  if (query.type !== undefined) addFilter('type = ?', query.type);
  if (query.minPrice !== undefined) addFilter('price >= ?', query.minPrice);
  if (query.maxPrice !== undefined) addFilter('price <= ?', query.maxPrice);
  if (query.bedrooms !== undefined) addFilter('bedrooms = ?', query.bedrooms);

  const cte = `WITH distances AS (
    SELECT ${columns},
      2 * 6371.0088 * asin(sqrt(least(1.0,
        power(sin(radians(latitude - $1::double precision) / 2), 2) +
        cos(radians($1::double precision)) * cos(radians(latitude)) *
        power(sin(radians(longitude - $2::double precision) / 2), 2)
      ))) AS distance_km
    FROM listings
  )`;
  const where = `FROM distances WHERE ${conditions.join(' AND ')}`;

  const count = await pool.query<{ count: string }>(`${cte} SELECT count(*) ${where}`, values);
  const result = await pool.query<ListingRow>(
    `${cte} SELECT * ${where} ORDER BY distance_km ASC, id ASC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, (page - 1) * limit],
  );
  return { rows: result.rows, total: Number(count.rows[0]!.count) };
}
