import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { Logger } from "pino";

export function requestContext(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const received = req.header("x-request-id");
    const requestId =
      received && /^[\w.-]{1,128}$/.test(received) ? received : randomUUID();
    const startedAt = performance.now();
    res.setHeader("X-Request-Id", requestId);
    res.locals.requestId = requestId;
    res.on("finish", () => {
      const fields = {
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
        userId: res.locals.user?.id,
        errorCode: res.locals.errorCode,
      };
      if (res.statusCode >= 500) logger.error(fields, "HTTP request failed");
      else if (res.statusCode === 401 || res.statusCode === 403)
        logger.warn(fields, "HTTP request rejected");
      else if (res.statusCode >= 400)
        logger.info(fields, "HTTP request conflict");
      else logger.info(fields, "HTTP request");
    });
    next();
  };
}
