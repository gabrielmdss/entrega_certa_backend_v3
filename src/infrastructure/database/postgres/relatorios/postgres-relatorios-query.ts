import type { Pool } from "pg";
import type {
  Paginated,
  RelatoriosQueryPort,
} from "../../../../application/relatorios/ports/relatorios-query.port.js";

function output(
  rows: Array<Record<string, unknown>>,
  page: number,
  limit: number,
): Paginated {
  const total = Number(rows[0]?.total_registros ?? 0);
  return {
    data: rows.map((source) => {
      const row = { ...source };
      delete row.total_registros;
      return row;
    }),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
function add(
  where: string[],
  values: unknown[],
  expression: string,
  value: unknown,
) {
  values.push(value);
  where.push(expression.replace("?", `$${values.length}`));
}

export class PostgresRelatoriosQuery implements RelatoriosQueryPort {
  constructor(private readonly pool: Pool) {}
  async distribuicoes(
    f: Parameters<RelatoriosQueryPort["distribuicoes"]>[0],
  ): Promise<Paginated> {
    const w: string[] = [],
      v: unknown[] = [];
    if (f.dataInicio) add(w, v, "d.data_prevista>=?", f.dataInicio);
    if (f.dataFim) add(w, v, "d.data_prevista<=?", f.dataFim);
    if (f.competencia) {
      const [ano, mes] = f.competencia.split("-");
      add(w, v, "c.ano=?", Number(ano));
      add(w, v, "c.mes=?", Number(mes));
    }
    if (f.grupoId) add(w, v, "d.grupo_distribuicao_id=?", f.grupoId);
    if (f.status) add(w, v, "d.status=?", f.status);
    v.push(f.limit, (f.page - 1) * f.limit);
    const limit = `$${v.length - 1}`,
      offset = `$${v.length}`;
    const q = await this.pool.query(
      `SELECT count(*) OVER()::int total_registros,d.id::text,d.data_prevista::text data,d.status,c.ano::int,c.mes::int,g.id::text "grupoId",g.codigo grupo,
      (SELECT count(*)::int FROM pastoral.direitos_beneficio x WHERE x.distribuicao_prevista_id=d.id) previstos,
      (SELECT count(*)::int FROM pastoral.distribuicoes_checkins x WHERE x.distribuicao_id=d.id) presentes,
      (SELECT count(*)::int FROM pastoral.retiradas x WHERE x.distribuicao_id=d.id AND x.status='VALIDA') retirados,
      (SELECT count(*)::int FROM pastoral.direitos_beneficio x WHERE x.distribuicao_prevista_id=d.id AND x.status IN('AUSENTE','AUSENTE_JUSTIFICADO','AUSENTE_NAO_JUSTIFICADO')) ausentes,
      (SELECT count(*)::int FROM pastoral.direitos_beneficio x WHERE x.distribuicao_prevista_id=d.id AND x.status='NAO_ATENDIDO_ESTOQUE') "naoAtendidosEstoque",
      (SELECT count(*)::int FROM pastoral.direitos_beneficio x WHERE x.distribuicao_prevista_id=d.id AND x.status='NAO_ATENDIDO_IRREGULARIDADE') "naoAtendidosIrregularidade",
      (SELECT COALESCE(sum(quantidade),0)::int FROM pastoral.cestas_adicionais x WHERE x.distribuicao_id=d.id AND x.status='ENTREGUE') extras
      FROM pastoral.distribuicoes d JOIN pastoral.competencias c ON c.id=d.competencia_id JOIN pastoral.grupos_distribuicao g ON g.id=d.grupo_distribuicao_id
      ${w.length ? `WHERE ${w.join(" AND ")}` : ""} ORDER BY d.data_prevista DESC,d.id DESC LIMIT ${limit} OFFSET ${offset}`,
      v,
    );
    return output(q.rows, f.page, f.limit);
  }
  async beneficiarios(
    f: Parameters<RelatoriosQueryPort["beneficiarios"]>[0],
  ): Promise<Paginated> {
    const w: string[] = [],
      v: unknown[] = [];
    if (f.status) add(w, v, "b.status=?", f.status);
    if (f.grupoId) add(w, v, "b.grupo_distribuicao_id=?", f.grupoId);
    if (f.dataAdmissaoInicio)
      add(w, v, "b.data_admissao>=?", f.dataAdmissaoInicio);
    if (f.dataAdmissaoFim) add(w, v, "b.data_admissao<=?", f.dataAdmissaoFim);
    v.push(f.limit, (f.page - 1) * f.limit);
    const limit = `$${v.length - 1}`,
      offset = `$${v.length}`;
    const q = await this.pool.query(
      `SELECT count(*) OVER()::int total_registros,b.id::text,p.nome_completo beneficiario,b.status "situacaoAtual",b.data_admissao::text "dataAdmissao",g.id::text "grupoId",g.codigo grupo,
      (SELECT max(r.ocorrido_em) FROM pastoral.retiradas r WHERE r.beneficiario_id=b.id AND r.status='VALIDA') "ultimaRetirada",
      (SELECT count(*)::int FROM pastoral.retiradas r WHERE r.beneficiario_id=b.id AND r.status='VALIDA') "quantidadeRetiradas",
      (SELECT count(*)::int FROM pastoral.ausencias a JOIN pastoral.direitos_beneficio db ON db.id=a.direito_beneficio_id WHERE db.beneficiario_id=b.id) ausencias
      FROM pastoral.beneficiarios b JOIN pastoral.pessoas p ON p.id=b.pessoa_id LEFT JOIN pastoral.grupos_distribuicao g ON g.id=b.grupo_distribuicao_id
      ${w.length ? `WHERE ${w.join(" AND ")}` : ""} ORDER BY p.nome_normalizado,b.id LIMIT ${limit} OFFSET ${offset}`,
      v,
    );
    return output(q.rows, f.page, f.limit);
  }
  async estoque(
    f: Parameters<RelatoriosQueryPort["estoque"]>[0],
  ): Promise<Paginated> {
    const w: string[] = [],
      v: unknown[] = [];
    if (f.insumo)
      add(w, v, "concat(i.nome,' ',a.descricao) ILIKE '%'||?||'%'", f.insumo);
    if (f.tipoMovimento) add(w, v, "m.tipo=?", f.tipoMovimento);
    if (f.dataInicio) add(w, v, "m.ocorrido_em>=?::date", f.dataInicio);
    if (f.dataFim) add(w, v, "m.ocorrido_em<?::date+1", f.dataFim);
    v.push(f.limit, (f.page - 1) * f.limit);
    const limit = `$${v.length - 1}`,
      offset = `$${v.length}`;
    const q = await this.pool.query(
      `SELECT count(*) OVER()::int total_registros,a.id::text "apresentacaoInsumoId",i.nome insumo,a.descricao apresentacao,
      COALESCE(sum(m.quantidade) FILTER(WHERE m.sentido=1 AND m.tipo='ENTRADA'),0)::int entradas,
      COALESCE(sum(m.quantidade) FILTER(WHERE m.sentido=-1 AND m.tipo<>'PERDA'),0)::int saidas,
      COALESCE(sum(m.quantidade) FILTER(WHERE m.tipo='PERDA'),0)::int perdas,
      COALESCE(sum(m.quantidade*m.sentido) FILTER(WHERE m.tipo='AJUSTE_INVENTARIO'),0)::int ajustes,
      COALESCE(sum(m.quantidade*m.sentido),0)::int "saldoPeriodo",
      COALESCE((SELECT s.saldo_fisico FROM pastoral.vw_saldo_insumos s WHERE s.apresentacao_insumo_id=a.id),0)::int saldo
      FROM pastoral.insumos_apresentacoes a JOIN pastoral.insumos i ON i.id=a.insumo_id LEFT JOIN pastoral.movimentacoes_insumos m ON m.apresentacao_insumo_id=a.id
      ${w.length ? `WHERE ${w.join(" AND ")}` : ""} GROUP BY a.id,i.nome,a.descricao ORDER BY i.nome,a.descricao,a.id LIMIT ${limit} OFFSET ${offset}`,
      v,
    );
    return output(q.rows, f.page, f.limit);
  }
}
