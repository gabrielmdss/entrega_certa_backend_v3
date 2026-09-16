import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PostgresCandidatura } from "../../../src/infrastructure/database/postgres/candidaturas/postgres-candidatura.js";
describe("listagem segura de candidaturas", () => {
  it("mascara documentos e retorna a última tentativa sem N+1", async () => {
    const query = vi
      .fn()
      .mockResolvedValue({
        rows: [
          {
            id: "1",
            pessoa_id: "2",
            nome: "Maria",
            status: "AGUARDANDO",
            data_entrada: new Date("2026-01-01T00:00:00Z"),
            prioridade_excepcional: false,
            documentos: [{ tipo: "CPF", numero: "12345678942" }],
            tentativas_contato: "2",
            ultima_tentativa: {
              resultado: "SEM_RESPOSTA",
              observacao: null,
              ocorridoEm: "2026-01-02T00:00:00Z",
            },
          },
        ],
      });
    const result = await new PostgresCandidatura({
      query,
    } as unknown as Pool).listar({ nome: "Maria" });
    expect(query).toHaveBeenCalledTimes(1);
    expect(result[0]?.documentos).toEqual([
      { tipo: "CPF", numeroMascarado: "***.***.***-42" },
    ]);
    expect(result[0]?.ultimaTentativaContato?.resultado).toBe("SEM_RESPOSTA");
  });
});
