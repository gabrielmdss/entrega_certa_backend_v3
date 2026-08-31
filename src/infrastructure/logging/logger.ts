import pino from 'pino';
import { env } from '../../main/config.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: ['password', 'token', 'authorization', 'req.headers.authorization'],
});
