import { Router } from 'express';
import type { AuthController } from './auth.controller.js';
import type { RequestHandler } from 'express';
export function createAuthRouter(controller:AuthController,authentication:RequestHandler){const r=Router();r.post('/login',controller.login);r.get('/me',authentication,controller.me);return r;}
