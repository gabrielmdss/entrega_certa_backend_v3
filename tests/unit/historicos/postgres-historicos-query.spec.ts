import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PostgresHistoricosQuery } from "../../../src/infrastructure/database/postgres/historicos/postgres-historicos-query.js";

describe("PostgresHistoricosQuery", () => {
  it("projeta o ID persistido em cada evento de justificativa", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ nome_completo: "Maria" }] })
      .mockResolvedValueOnce({
        rows: [{
          tipo: "JUSTIFICATIVA",
          ocorridoEm: "2026-09-04T14:00:00.000Z",
          detalhes: {
            justificativaId: "9",
            ausenciaId: "8",
            decisao: "PENDENTE",
            momento: "DEPOIS_DISTRIBUICAO",
          },
        }],
      });
    const sut = new PostgresHistoricosQuery({ query } as unknown as Pool);

    await expect(sut.beneficiario("1")).resolves.toMatchObject({
      eventos: [{ detalhes: { justificativaId: "9", ausenciaId: "8" } }],
    });
    expect(query.mock.calls[1]?.[0]).toContain(
      "'justificativaId',j.id::text",
    );
  });
});
