import { describe, expect, it, vi } from "vitest";
import { sanitizeAuditSnapshot } from "../../../src/application/auditoria/ports/auditoria-query.port.js";
import {
  ListarAuditoriaUseCase,
  ObterAuditoriaUseCase,
} from "../../../src/application/auditoria/use-cases/auditoria.use-cases.js";
describe("auditoria", () => {
  it("remove segredos recursivamente", () => {
    const value = sanitizeAuditSnapshot({
      login: "x",
      senha_hash: "hash",
      nested: { password: "p", JWT_SECRET: "s", ok: true },
      items: [{ DB_PASSWORD: "d", token: "t", id: 1 }],
    });
    const text = JSON.stringify(value);
    expect(text).not.toMatch(
      /senha_hash|password|JWT_SECRET|DB_PASSWORD|token/i,
    );
    expect(value).toEqual({
      login: "x",
      nested: { ok: true },
      items: [{ id: 1 }],
    });
  });
  it("pagina e obtém pelo port", async () => {
    const result = { data: [], meta: { page: 1, limit: 50, total: 0 } },
      q = {
        listar: vi.fn().mockResolvedValue(result),
        obter: vi.fn().mockResolvedValue({ id: "1" }),
      };
    await expect(
      new ListarAuditoriaUseCase(q).execute({
        page: 1,
        limit: 50,
        usuarioId: "3",
      }),
    ).resolves.toBe(result);
    await expect(new ObterAuditoriaUseCase(q).execute("1")).resolves.toEqual({
      id: "1",
    });
    expect(q.listar).toHaveBeenCalledWith({
      page: 1,
      limit: 50,
      usuarioId: "3",
    });
  });
  it("retorna não encontrado no detalhe", async () => {
    const q = { listar: vi.fn(), obter: vi.fn().mockResolvedValue(null) };
    await expect(
      new ObterAuditoriaUseCase(q).execute("9"),
    ).rejects.toMatchObject({ code: "AUDITORIA_NAO_ENCONTRADA" });
  });
});
