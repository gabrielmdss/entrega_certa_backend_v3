import type { Pool } from "pg";
import type {
  AuditoriaFilters,
  AuditoriaQueryPort,
} from "../../../../application/auditoria/ports/auditoria-query.port.js";
import { sanitizeAuditSnapshot } from "../../../../application/auditoria/ports/auditoria-query.port.js";
function add(w: string[], v: unknown[], sql: string, value: unknown) {
  v.push(value);
  w.push(sql.replace("?", `$${v.length}`));
}
export class PostgresAuditoriaQuery implements AuditoriaQueryPort {
  constructor(private readonly pool: Pool) {}
  async listar(f: AuditoriaFilters) {
    const w: string[] = [],
      v: unknown[] = [];
    if (f.usuarioId) add(w, v, "a.usuario_id=?", f.usuarioId);
    if (f.entidade) add(w, v, "a.entidade=?", f.entidade.toUpperCase());
    if (f.entidadeId) add(w, v, "a.entidade_id=?", f.entidadeId);
    if (f.operacao) add(w, v, "a.operacao=?", f.operacao.toUpperCase());
    if (f.dataInicio) add(w, v, "a.ocorrido_em>=?::date", f.dataInicio);
    if (f.dataFim) add(w, v, "a.ocorrido_em<?::date+1", f.dataFim);
    v.push(f.limit, (f.page - 1) * f.limit);
    const limit = `$${v.length - 1}`,
      offset = `$${v.length}`;
    const rows = (
      await this.pool.query(
        `SELECT count(*) OVER()::int total,a.id::text,a.entidade,a.entidade_id::text "entidadeId",a.operacao,a.motivo,a.ocorrido_em "ocorridoEm",a.estado_anterior IS NOT NULL "possuiEstadoAnterior",a.estado_novo IS NOT NULL "possuiEstadoNovo",u.id::text usuario_id,u.login FROM pastoral.auditoria a LEFT JOIN pastoral.usuarios u ON u.id=a.usuario_id ${w.length ? `WHERE ${w.join(" AND ")}` : ""} ORDER BY a.ocorrido_em DESC,a.id DESC LIMIT ${limit} OFFSET ${offset}`,
        v,
      )
    ).rows;
    const total = Number(rows[0]?.total ?? 0);
    return {
      data: rows.map((r) => ({
        id: String(r.id),
        usuario: r.usuario_id
          ? { id: String(r.usuario_id), login: r.login }
          : null,
        entidade: r.entidade,
        entidadeId: r.entidadeId,
        operacao: r.operacao,
        motivo: r.motivo,
        ocorridoEm: r.ocorridoEm,
        possuiEstadoAnterior: r.possuiEstadoAnterior,
        possuiEstadoNovo: r.possuiEstadoNovo,
      })),
      meta: {
        page: f.page,
        limit: f.limit,
        total,
        totalPages: Math.ceil(total / f.limit),
      },
    };
  }
  async obter(id: string) {
    const r = (
      await this.pool.query(
        `SELECT a.id::text,a.entidade,a.entidade_id::text "entidadeId",a.operacao,a.motivo,a.ocorrido_em "ocorridoEm",a.estado_anterior "estadoAnterior",a.estado_novo "estadoNovo",u.id::text usuario_id,u.login FROM pastoral.auditoria a LEFT JOIN pastoral.usuarios u ON u.id=a.usuario_id WHERE a.id=$1`,
        [id],
      )
    ).rows[0];
    return r
      ? {
          id: String(r.id),
          usuario: r.usuario_id
            ? { id: String(r.usuario_id), login: r.login }
            : null,
          entidade: r.entidade,
          entidadeId: r.entidadeId,
          operacao: r.operacao,
          motivo: r.motivo,
          ocorridoEm: r.ocorridoEm,
          estadoAnterior: sanitizeAuditSnapshot(r.estadoAnterior),
          estadoNovo: sanitizeAuditSnapshot(r.estadoNovo),
        }
      : null;
  }
}
