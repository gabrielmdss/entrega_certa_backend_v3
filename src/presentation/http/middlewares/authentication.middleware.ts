import type { NextFunction, Request, Response } from "express";
import type { TokenServicePort } from "../../../application/auth/ports/token-service.port.js";
import type { AuthQueryPort } from "../../../application/auth/ports/auth-query.port.js";
import { DomainError } from "../../../shared/errors/domain-error.js";

export function authenticate(tokens: TokenServicePort, users: AuthQueryPort) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const header = req.header("authorization");
      if (!header?.startsWith("Bearer "))
        throw new DomainError("NAO_AUTENTICADO", "Token ausente");
      const payload = await tokens.verify(header.slice(7));
      const user = await users.findById(payload.subject);
      if (!user?.ativo)
        throw new DomainError("NAO_AUTENTICADO", "Token inválido");
      res.locals.user = user;
      res.locals.permissions = user.permissoes;
      next();
    } catch (error) {
      next(
        error instanceof DomainError
          ? error
          : new DomainError("NAO_AUTENTICADO", "Token inválido"),
      );
    }
  };
}
