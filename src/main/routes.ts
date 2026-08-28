import { Router } from 'express';
import { dependencies } from './dependencies.js';
import { createBeneficiariosRouter } from '../presentation/http/beneficiarios/beneficiarios.routes.js';
export function createRoutes(): Router {
  const router = Router();
  router.use('/api/v1/beneficiarios', createBeneficiariosRouter(dependencies.beneficiariosController));
  return router;
}
