import { Router } from 'express';
import type { BeneficiariosController } from './beneficiarios.controller.js';
export function createBeneficiariosRouter(controller: BeneficiariosController): Router {
  const router = Router();
  router.get('/:id', controller.obterPorId);
  return router;
}
