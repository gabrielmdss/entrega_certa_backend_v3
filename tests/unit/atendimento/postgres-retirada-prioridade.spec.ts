import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PostgresRetirada } from "../../../src/infrastructure/database/postgres/atendimento/postgres-retirada.js";

describe("prioridade da fila operacional", () => {
  it("bloqueia PENDENTE enquanto houver REGULAR realmente aguardando", async () => {
    let prioritySql = "";
    const query = vi.fn(async (sql: string) => {
      if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [], rowCount: null };
      if (sql.includes("FROM pastoral.distribuicoes WHERE id=$1 FOR UPDATE"))
        return { rows: [{ status: "ABERTA", competencia_id: "20" }], rowCount: 1 };
      if (sql.includes("FROM pastoral.beneficiarios WHERE id=$1"))
        return { rows: [{ status: "ATIVO" }], rowCount: 1 };
      if (sql.includes("classificacao_inicial classificacao"))
        return { rows: [{ classificacao: "PENDENTE" }], rowCount: 1 };
      if (sql.includes("FROM pastoral.direitos_beneficio WHERE beneficiario_id"))
        return {
          rows: [{ id: "30", status: "DISPONIVEL", distribuicao_prevista_id: "10" }],
          rowCount: 1,
        };
      if (sql.includes("JOIN pastoral.competencias old"))
        return { rows: [], rowCount: 0 };
      if (sql.includes("ci.classificacao_inicial='REGULAR'")) {
        prioritySql = sql;
        return { rows: [{}], rowCount: 1 };
      }
      throw new Error(`Query inesperada: ${sql}`);
    });
    const client = { query, release: vi.fn() };
    const adapter = new PostgresRetirada({
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as Pool);

    await expect(
      adapter.registrar({
        distribuicaoId: "10",
        beneficiarioId: "50",
        tipo: "TITULAR",
        formaIdentificacao: "DOCUMENTO",
        representante: null,
        justificativaExcecao: null,
        usuarioId: "60",
      }),
    ).rejects.toMatchObject({ code: "REGULARES_AGUARDANDO" });
    expect(prioritySql).toContain("db.status='DISPONIVEL'");
    expect(prioritySql).toContain(
      "db.distribuicao_prevista_id=ci.distribuicao_id",
    );
    expect(prioritySql).toContain("r.status='VALIDA'");
    expect(prioritySql).toContain("NOT EXISTS");
  });

  it("deixa PENDENTE prosseguir quando o único REGULAR disponível pertence a outra distribuição", async () => {
    const query = vi.fn(async (sql: string) => {
      if (["BEGIN", "COMMIT", "SET LOCAL search_path TO pastoral,public"].includes(sql))
        return { rows: [], rowCount: null };
      if (sql.includes("FROM pastoral.distribuicoes WHERE id=$1 FOR UPDATE"))
        return { rows: [{ status: "ABERTA", competencia_id: "20" }], rowCount: 1 };
      if (sql.includes("FROM pastoral.beneficiarios WHERE id=$1"))
        return { rows: [{ status: "ATIVO" }], rowCount: 1 };
      if (sql.includes("classificacao_inicial classificacao"))
        return { rows: [{ classificacao: "PENDENTE" }], rowCount: 1 };
      if (sql.includes("FROM pastoral.direitos_beneficio WHERE beneficiario_id"))
        return { rows: [{ id: "30", status: "DISPONIVEL", distribuicao_prevista_id: "10" }], rowCount: 1 };
      if (sql.includes("JOIN pastoral.competencias old")) return { rows: [], rowCount: 0 };
      if (sql.includes("ci.classificacao_inicial='REGULAR'")) return { rows: [], rowCount: 0 };
      if (sql.includes("pastoral.registrar_retirada")) return { rows: [{ id: "70" }], rowCount: 1 };
      if (sql.includes("INSERT INTO pastoral.auditoria")) return { rows: [], rowCount: 1 };
      throw new Error(`Query inesperada: ${sql}`);
    });
    const client = { query, release: vi.fn() };
    const adapter = new PostgresRetirada({ connect: vi.fn().mockResolvedValue(client) } as unknown as Pool);

    await expect(adapter.registrar({ distribuicaoId: "10", beneficiarioId: "P1", tipo: "TITULAR", formaIdentificacao: "DOCUMENTO", representante: null, justificativaExcecao: null, usuarioId: "60" })).resolves.toEqual({ id: "70" });
  });
});
