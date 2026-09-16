import type { Pool, PoolClient } from "pg";
import type { JustificativaCommandPort } from "../../../../application/atendimento/ports/justificativa-command.port.js";
import { DomainError } from "../../../../shared/errors/domain-error.js";
export class PostgresJustificativaCommand implements JustificativaCommandPort {
  constructor(private readonly pool: Pool) {}
  registrar(i: Parameters<JustificativaCommandPort["registrar"]>[0]) {
    return this.tx(async (c) => {
      const a = await c.query<{ status: string }>(
        "SELECT status FROM pastoral.ausencias WHERE id=$1 FOR UPDATE",
        [i.ausenciaId],
      );
      if (!a.rows[0])
        throw new DomainError(
          "AUSENCIA_NAO_ENCONTRADA",
          "Ausência não encontrada",
        );
      if (
        (
          await c.query(
            "SELECT 1 FROM pastoral.justificativas_ausencia WHERE ausencia_id=$1 AND decisao='PENDENTE'",
            [i.ausenciaId],
          )
        ).rowCount
      )
        throw new DomainError(
          "JUSTIFICATIVA_PENDENTE_EXISTENTE",
          "Já existe justificativa pendente",
        );
      const r = await c.query<{ id: string }>(
        "INSERT INTO pastoral.justificativas_ausencia(ausencia_id,descricao,momento,usuario_registro_id,decisao) VALUES($1,$2,$3,$4,'PENDENTE') RETURNING id::text",
        [i.ausenciaId, i.descricao, i.momento, i.usuarioId],
      );
      const id = r.rows[0]?.id;
      if (!id) throw new Error("Falha ao registrar justificativa");
      await c.query(
        "UPDATE pastoral.ausencias SET status='JUSTIFICATIVA_PENDENTE' WHERE id=$1",
        [i.ausenciaId],
      );
      await audit(
        c,
        i.usuarioId,
        "JUSTIFICATIVA_AUSENCIA",
        id,
        "REGISTRO",
        null,
        { ausenciaId: i.ausenciaId, momento: i.momento },
        i.descricao,
      );
      return { id };
    });
  }
  avaliar(i: Parameters<JustificativaCommandPort["avaliar"]>[0]) {
    return this.tx(async (c) => {
      const r = await c.query<{ ausencia_id: string; decisao: string }>(
        `SELECT ausencia_id::text,decisao FROM pastoral.justificativas_ausencia WHERE id=$1 FOR UPDATE`,
        [i.justificativaId],
      );
      const j = r.rows[0];
      if (!j)
        throw new DomainError(
          "JUSTIFICATIVA_NAO_ENCONTRADA",
          "Justificativa não encontrada",
        );
      if (j.decisao !== "PENDENTE")
        throw new DomainError(
          "JUSTIFICATIVA_JA_AVALIADA",
          "Justificativa já avaliada",
        );
      await c.query(
        "UPDATE pastoral.justificativas_ausencia SET decisao=$2,usuario_decisao_id=$3,data_decisao=now(),observacao_decisao=$4 WHERE id=$1",
        [i.justificativaId, i.decisao, i.usuarioId, i.observacao],
      );
      await c.query("UPDATE pastoral.ausencias SET status=$2 WHERE id=$1", [
        j.ausencia_id,
        i.decisao === "ACEITA" ? "JUSTIFICADA" : "JUSTIFICATIVA_REJEITADA",
      ]);
      await audit(
        c,
        i.usuarioId,
        "JUSTIFICATIVA_AUSENCIA",
        i.justificativaId,
        "AVALIACAO",
        { decisao: "PENDENTE" },
        { decisao: i.decisao },
        i.observacao,
      );
    });
  }
  private async tx<T>(op: (c: PoolClient) => Promise<T>) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const x = await op(c);
      await c.query("COMMIT");
      return x;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
}
async function audit(
  c: PoolClient,
  userId: string,
  entity: string,
  id: string,
  operation: string,
  before: unknown,
  after: unknown,
  reason: string | null,
) {
  await c.query(
    "INSERT INTO pastoral.auditoria(usuario_id,entidade,entidade_id,operacao,estado_anterior,estado_novo,motivo) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [userId, entity, id, operation, before, after, reason],
  );
}
