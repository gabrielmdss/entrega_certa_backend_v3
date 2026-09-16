import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { extname, join } from "node:path";
import multer from "multer";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { DomainError } from "../../../shared/errors/domain-error.js";

const MIME_EXTENSOES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export function createUploadFotoMiddleware(storagePath: string): RequestHandler {
  const pessoasDir = join(storagePath, "pessoas");
  if (!existsSync(pessoasDir)) mkdirSync(pessoasDir, { recursive: true });
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, pessoasDir),
    filename: (_req, file, cb) => {
      const extensao = MIME_EXTENSOES[file.mimetype] ?? extname(file.originalname).slice(0, 10);
      cb(null, `${randomUUID()}${extensao}`);
    },
  });
  const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (!MIME_EXTENSOES[file.mimetype]) {
        cb(new DomainError("TIPO_ARQUIVO_INVALIDO", "Envie uma imagem JPEG, PNG ou WEBP"));
        return;
      }
      cb(null, true);
    },
  }).single("foto");
  return (req: Request, res: Response, next: NextFunction) => {
    upload(req, res, (error: unknown) => {
      if (error instanceof DomainError) { next(error); return; }
      if (error instanceof multer.MulterError) {
        next(new DomainError("ARQUIVO_INVALIDO", error.code === "LIMIT_FILE_SIZE" ? "Arquivo maior que 5MB" : "Arquivo inválido"));
        return;
      }
      if (error) { next(error); return; }
      if (!req.file) { next(new DomainError("ARQUIVO_OBRIGATORIO", "Envie o arquivo no campo \"foto\"")); return; }
      next();
    });
  };
}
