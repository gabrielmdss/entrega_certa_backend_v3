import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { PostgresAtendimento } from "../../../src/infrastructure/database/postgres/atendimento/postgres-atendimento.js";

describe("fila operacional de check-ins", () => {
  it("deriva atendimento, aptidão e prioridade pelo direito da distribuição atual", async () => {
    let includeR3 = false;
    let r1Withdrawn = true;
    const query = async (sql: string, params?: readonly unknown[]) => {
      if (sql.includes("FROM pastoral.distribuicoes d"))
        return { rows: [{ id: "10", status: "ABERTA", competencia_id: "20", grupo_id: "30", grupo_codigo: "G1" }] };
      if (sql.includes("FROM pastoral.distribuicoes_checkins ci JOIN")) {
        const rows = [
          row("R1", "REGULAR", r1Withdrawn, r1Withdrawn ? "RETIRADO" : "DISPONIVEL", "10"),
          row("R2", "REGULAR", false, "DISPONIVEL", "11"),
          row("P1", "PENDENTE", false, "DISPONIVEL", "10"),
        ];
        if (includeR3) rows.push(row("R3", "REGULAR", false, "DISPONIVEL", "10"));
        return { rows };
      }
      if (sql.includes("SELECT distribuicao_prevista_id::text"))
        return { rows: [{ distribuicao_prevista_id: params?.[0] === "R2" ? "11" : "10" }] };
      if (sql.includes("SELECT g.codigo")) return { rows: [{ codigo: "GRUPO_B" }] };
      if (sql.includes("JOIN pastoral.competencias atual")) return { rows: [] };
      throw new Error(`Query inesperada: ${sql}`);
    };
    const adapter = new PostgresAtendimento({ query } as unknown as Pool);

    const withoutR3 = await adapter.listarCheckIns({ distribuicaoId: "10" });
    expect(find(withoutR3, "R1")).toMatchObject({ situacaoOperacional: "ATENDIDO", podeRetirar: false, motivoBloqueio: "DIREITO_JA_CONSUMIDO" });
    expect(find(withoutR3, "R2")).toMatchObject({ situacaoOperacional: "AGUARDANDO", podeRetirar: false, motivoBloqueio: "DIREITO_NAO_DISPONIVEL", pendencias: [{ codigo: "GRUPO_DIFERENTE", grupoEsperado: "GRUPO_B" }] });
    expect(find(withoutR3, "P1")).toMatchObject({ situacaoOperacional: "AGUARDANDO", podeRetirar: true, motivoBloqueio: null });

    includeR3 = true;
    const withR3 = await adapter.listarCheckIns({ distribuicaoId: "10" });
    expect(find(withR3, "R3")).toMatchObject({ podeRetirar: true });
    expect(find(withR3, "P1")).toMatchObject({ podeRetirar: false, motivoBloqueio: "REGULARES_AGUARDANDO" });

    includeR3 = false;
    r1Withdrawn = false;
    const afterReversal = await adapter.listarCheckIns({ distribuicaoId: "10" });
    expect(find(afterReversal, "R1")).toMatchObject({ situacaoOperacional: "AGUARDANDO", podeRetirar: true });
    expect(find(afterReversal, "P1")).toMatchObject({ podeRetirar: false, motivoBloqueio: "REGULARES_AGUARDANDO" });
  });
});

function row(id: string, classificacao: "REGULAR" | "PENDENTE", retiradaValida: boolean, direitoStatus: string, distribuicaoPrevistaId: string) {
  return { id, beneficiario_id: id, nome: id, grupo_id: "30", classificacao, retirada_valida: retiradaValida, direito_status: direitoStatus, distribuicao_prevista_id: distribuicaoPrevistaId, ocorrido_em: new Date("2026-09-04T12:00:00.000Z") };
}

function find(rows: Awaited<ReturnType<PostgresAtendimento["listarCheckIns"]>>, id: string) {
  return rows.find((item) => item.id === id);
}
