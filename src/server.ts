import { buildApp } from './app.js';
import { createPool } from './db.js';

const pool = createPool();
const app = buildApp(pool);
const port = Number(process.env.PORT ?? 3000);

try {
  await pool.query('SELECT 1');
  await app.listen({ host: '0.0.0.0', port });
  console.log(`API listening on http://localhost:${port}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
  await app.close();
  await pool.end();
}

async function shutdown() {
  await app.close();
  await pool.end();
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
