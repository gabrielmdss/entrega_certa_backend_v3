import express from 'express';
import cors from 'cors';
import { env } from './config.js';
import { createRoutes } from './routes.js';
import { errorHandler } from '../presentation/http/middlewares/error-handler.middleware.js';
import { dependencies } from './dependencies.js';

export function createApp() {
  const app = express();
  app.use(cors({ origin: env.CORS_ORIGINS.split(',').map(v => v.trim()) }));
  app.use(express.json());
  app.get('/health', (_req,res) => res.status(200).json({ status: 'ok' }));
  app.get('/ready', async (_req,res,next) => { try { await dependencies.postgresPool.query('SELECT 1'); res.status(200).json({ status:'ready', database:'ok' }); } catch (e) { next(e); } });
  app.use(createRoutes());
  app.use((_req,res) => res.status(404).json({ error: { code:'ROTA_NAO_ENCONTRADA', message:'Rota não encontrada' } }));
  app.use(errorHandler);
  return app;
}
