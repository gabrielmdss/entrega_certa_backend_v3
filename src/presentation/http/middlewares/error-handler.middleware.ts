import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { DomainError } from "../../../shared/errors/domain-error.js";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  void _next;
  if (error instanceof ZodError) {
    res.locals.errorCode = "VALIDACAO_INVALIDA";
    res
      .status(400)
      .json({
        error: {
          code: "VALIDACAO_INVALIDA",
          message: "Dados inválidos",
          details: error.flatten(),
        },
      });
    return;
  }
  if (error instanceof DomainError) {
    res.locals.errorCode = error.code;
    const status =
      error.code === "NAO_AUTENTICADO" ||
      error.code === "CREDENCIAIS_INVALIDAS" ||
      error.code === "USUARIO_INATIVO"
        ? 401
        : error.code === "PERMISSAO_NEGADA" ||
            error.code === "ESTORNO_NAO_AUTORIZADO"
          ? 403
          : error.code.endsWith("NAO_ENCONTRADO") ||
              error.code.endsWith("NAO_ENCONTRADA")
            ? 404
            : 409;
    res
      .status(status)
      .json({
        error: {
          code: error.code,
          message: error.message,
          details: error.details ?? null,
        },
      });
    return;
  }
  const pgCode =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : null;
  const mapped: Record<string, { code: string; message: string }> = {
    "23505": { code: "REGISTRO_DUPLICADO", message: "Registro já existente" },
    "23503": {
      code: "REFERENCIA_INVALIDA",
      message: "Referência relacionada inválida",
    },
    "23514": {
      code: "REGRA_DE_INTEGRIDADE",
      message: "Operação viola uma regra de integridade",
    },
    "40001": {
      code: "CONCORRENCIA_REPETIR",
      message: "Conflito de concorrência; tente novamente",
    },
    "40P01": {
      code: "CONCORRENCIA_REPETIR",
      message: "Conflito de concorrência; tente novamente",
    },
    "55P03": {
      code: "RECURSO_OCUPADO",
      message: "Recurso temporariamente ocupado",
    },
  };
  if (pgCode && mapped[pgCode]) {
    const safe = mapped[pgCode];
    res.locals.errorCode = safe.code;
    res.status(409).json({ error: safe });
    return;
  }
  res.locals.errorCode = "ERRO_INTERNO";
  res
    .status(500)
    .json({
      error: {
        code: "ERRO_INTERNO",
        message: "Erro interno do servidor",
        requestId: res.locals.requestId,
      },
    });
};
