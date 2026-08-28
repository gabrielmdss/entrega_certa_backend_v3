import { createApp } from './app.js';
import { env } from './config.js';
import { dependencies } from './dependencies.js';

async function bootstrap(): Promise<void> {
  await dependencies.postgresPool.query('SELECT 1');
  const server = createApp().listen(env.PORT, () => console.log(`Pastoral API listening on port ${env.PORT}`));
  const shutdown = (signal: string) => {
    console.log(`${signal} received. Shutting down.`);
    server.close(() => { void dependencies.postgresPool.end().finally(() => process.exit(0)); });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
bootstrap().catch(async (error) => { console.error('Failed to start application', error); await dependencies.postgresPool.end(); process.exit(1); });
