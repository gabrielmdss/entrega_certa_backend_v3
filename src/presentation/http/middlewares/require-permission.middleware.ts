import type { NextFunction, Request, Response } from "express";
import { DomainError } from "../../../shared/errors/domain-error.js";

export function requirePermission(permission: string) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const permissions: unknown = res.locals.permissions;
    if (!Array.isArray(permissions) || !permissions.includes(permission)) {
      next(new DomainError("PERMISSAO_NEGADA", "Permissão negada"));
      return;
    }
    next();
  };
}

export function requireAnyPermission(...required: string[]) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const permissions: unknown = res.locals.permissions;
    if (
      !Array.isArray(permissions) ||
      !required.some((permission) => permissions.includes(permission))
    ) {
      next(new DomainError("PERMISSAO_NEGADA", "Permissão negada"));
      return;
    }
    next();
  };
}
