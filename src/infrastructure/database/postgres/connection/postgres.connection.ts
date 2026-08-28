import { Pool } from 'pg';
import { env } from '../../../../main/config.js';

export const postgresPool = new Pool({
  host: env.DB_HOST, port: env.DB_PORT, database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD,
  max: env.DB_POOL_MAX, connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS, idleTimeoutMillis: env.DB_IDLE_TIMEOUT_MS,
  application_name: 'pastoral-api',
});

postgresPool.on('error', (error) => console.error('Unexpected PostgreSQL pool error', error));
