import type { Pool } from "pg";
import type { DistribuicaoCommandPort } from "../../../../application/distribuicoes/ports/distribuicao-command.port.js";
import { DomainError } from "../../../../shared/errors/domain-error.js";
export class PostgresDistribuicaoCommand implements DistribuicaoCommandPort {
  constructor(private readonly pool: Pool) {}
  async abrir(i: { id: string; usuarioId: string }) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const r = await c.query<{ status: string }>(
        "SELECT status FROM pastoral.distribuicoes WHERE id=$1 FOR UPDATE",
        [i.id],
      );
      const row = r.rows[0];
      if (!row)
        throw new DomainError(
          "DISTRIBUICAO_NAO_ENCONTRADA",
          "Distribuição não encontrada",
        );
      if (row.status === "ABERTA")
        throw new DomainError(
          "DISTRIBUICAO_JA_ABERTA",
          "Distribuição já está aberta",
        );
      if (row.status === "ENCERRADA")
        throw new DomainError(
          "DISTRIBUICAO_ENCERRADA",
          "Distribuição encerrada",
        );
      await c.query("SET LOCAL search_path TO pastoral,public");
      await c.query("SELECT pastoral.abrir_distribuicao($1,$2)", [
        i.id,
        i.usuarioId,
      ]);
      await c.query(
        "INSERT INTO pastoral.auditoria(usuario_id,entidade,entidade_id,operacao,estado_anterior,estado_novo) VALUES($1,'DISTRIBUICAO',$2,'ABERTURA',$3,$4)",
        [i.usuarioId, i.id, { status: row.status }, { status: "ABERTA" }],
      );
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async encerrar(i: { id: string; usuarioId: string }) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const row = (
        await c.query<{ status: string }>(
          "SELECT status FROM pastoral.distribuicoes WHERE id=$1 FOR UPDATE",
          [i.id],
        )
      ).rows[0];
      if (!row)
        throw new DomainError(
          "DISTRIBUICAO_NAO_ENCONTRADA",
          "Distribuição não encontrada",
        );
      if (row.status === "ENCERRADA")
        throw new DomainError(
          "DISTRIBUICAO_ENCERRADA",
          "Distribuição já encerrada",
        );
      if (row.status !== "ABERTA")
        throw new DomainError(
          "DISTRIBUICAO_NAO_ABERTA",
          "Distribuição não está aberta",
        );
      await c.query("SET LOCAL search_path TO pastoral,public");
      try {
        await c.query("SELECT pastoral.encerrar_distribuicao($1,$2)", [
          i.id,
          i.usuarioId,
        ]);
      } catch (e) {
        throw new DomainError(
          "ENCERRAMENTO_INVALIDO",
          e instanceof Error ? e.message : "Encerramento inválido",
        );
      }
      await c.query(
        "INSERT INTO pastoral.auditoria(usuario_id,entidade,entidade_id,operacao,estado_anterior,estado_novo) VALUES($1,'DISTRIBUICAO',$2,'ENCERRAMENTO',$3,$4)",
        [i.usuarioId, i.id, { status: "ABERTA" }, { status: "ENCERRADA" }],
      );
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
}
