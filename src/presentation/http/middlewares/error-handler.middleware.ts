import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { DomainError } from '../../../shared/errors/domain-error.js';

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: { code: 'VALIDACAO_INVALIDA', message: 'Dados inválidos', details: error.flatten() } });
    return;
  }
  if (error instanceof DomainError) {
    res.status(error.code.endsWith('NAO_ENCONTRADO') ? 404 : 409).json({ error: { code: error.code, message: error.message, details: error.details ?? null } });
    return;
  }
  console.error(error);
  res.status(500).json({ error: { code: 'ERRO_INTERNO', message: 'Erro interno do servidor' } });
};
