import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { errorHandler } from "../../../src/presentation/http/middlewares/error-handler.middleware.js";
describe("erros PostgreSQL", () => {
  for (const [pg, code] of [
    ["23505", "REGISTRO_DUPLICADO"],
    ["23503", "REFERENCIA_INVALIDA"],
    ["23514", "REGRA_DE_INTEGRIDADE"],
    ["40001", "CONCORRENCIA_REPETIR"],
    ["40P01", "CONCORRENCIA_REPETIR"],
    ["55P03", "RECURSO_OCUPADO"],
  ])
    it(`mapeia ${pg} sem detalhes internos`, async () => {
      const app = express();
      app.get("/", (_q, _r, n) =>
        n({ code: pg, constraint: "segredo", detail: "SQL interno" }),
      );
      app.use(errorHandler);
      const r = await request(app).get("/");
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe(code);
      expect(JSON.stringify(r.body)).not.toMatch(
        /segredo|SQL interno|constraint/,
      );
    });
});
