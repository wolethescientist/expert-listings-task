import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPool } from '../src/db.js';

const pool = createPool();
try {
  const sql = await readFile(resolve(process.cwd(), 'migrations/001_create_listings.sql'), 'utf8');
  await pool.query(sql);
  console.log('Database migration complete');
} finally {
  await pool.end();
}
