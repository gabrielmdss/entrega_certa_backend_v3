import type { Pool } from "pg";
import type {
  DistribuicaoOutput,
  DistribuicaoPort,
} from "../../../../application/distribuicoes/ports/distribuicao.port.js";
import { DomainError } from "../../../../shared/errors/domain-error.js";
interface Row {
  id: string;
  competencia_id: string;
  ano: number;
  mes: number;
  grupo_id: string;
  codigo: string;
  nome: string;
  data_prevista: string;
  data_real: string | null;
  status: string;
  previstos: string;
  check_ins: string;
  regulares: string;
  pendentes: string;
  retiradas: string;
  ausentes: string;
  nao_estoque: string;
  nao_irregularidade: string;
  cestas_liberadas: string;
  cestas_consumidas: string;
  cestas_retornadas: string;
  cestas_disponiveis: string;
}
const SELECT = `SELECT d.id::text,c.id::text competencia_id,c.ano::int,c.mes::int,g.id::text grupo_id,g.codigo,g.nome,d.data_prevista::text,d.data_real::text,d.status,count(DISTINCT db.id)::text previstos,count(DISTINCT ci.id)::text check_ins,count(DISTINCT ci.id) FILTER(WHERE ci.classificacao_inicial='REGULAR')::text regulares,count(DISTINCT ci.id) FILTER(WHERE ci.classificacao_inicial='PENDENTE')::text pendentes,count(DISTINCT db.id) FILTER(WHERE db.status='RETIRADO')::text retiradas,count(DISTINCT db.id) FILTER(WHERE db.status IN('AUSENTE','AUSENTE_JUSTIFICADO','AUSENTE_NAO_JUSTIFICADO'))::text ausentes,count(DISTINCT db.id) FILTER(WHERE db.status='NAO_ATENDIDO_ESTOQUE')::text nao_estoque,count(DISTINCT db.id) FILTER(WHERE db.status='NAO_ATENDIDO_IRREGULARIDADE')::text nao_irregularidade,COALESCE((SELECT sum(l.quantidade_liberada) FROM pastoral.distribuicoes_liberacoes_cestas l WHERE l.distribuicao_id=d.id),0)::text cestas_liberadas,COALESCE((SELECT sum(l.quantidade_consumida) FROM pastoral.distribuicoes_liberacoes_cestas l WHERE l.distribuicao_id=d.id),0)::text cestas_consumidas,COALESCE((SELECT sum(l.quantidade_retornada) FROM pastoral.distribuicoes_liberacoes_cestas l WHERE l.distribuicao_id=d.id),0)::text cestas_retornadas,COALESCE((SELECT sum(l.quantidade_liberada-l.quantidade_consumida-l.quantidade_retornada) FROM pastoral.distribuicoes_liberacoes_cestas l WHERE l.distribuicao_id=d.id),0)::text cestas_disponiveis FROM pastoral.distribuicoes d JOIN pastoral.competencias c ON c.id=d.competencia_id JOIN pastoral.grupos_distribuicao g ON g.id=d.grupo_distribuicao_id LEFT JOIN pastoral.direitos_beneficio db ON db.distribuicao_prevista_id=d.id LEFT JOIN pastoral.distribuicoes_checkins ci ON ci.distribuicao_id=d.id`;
export class PostgresDistribuicao implements DistribuicaoPort {
  constructor(private readonly pool: Pool) {}
  async listar(f: {
    competenciaId?: string;
    grupoId?: string;
    status?: string;
    data?: string;
  }) {
    const v: unknown[] = [];
    const w: string[] = [];
    for (const [value, column] of [
      [f.competenciaId, "d.competencia_id"],
      [f.grupoId, "d.grupo_distribuicao_id"],
      [f.status, "d.status"],
      [f.data, "d.data_prevista"],
    ] as const)
      if (value) {
        v.push(value);
        w.push(`${column}=$${v.length}`);
      }
    const rows = (
      await this.pool.query<Row>(
        `${SELECT} ${w.length ? `WHERE ${w.join(" AND ")}` : ""} GROUP BY d.id,c.id,c.ano,c.mes,g.id,g.codigo,g.nome,d.data_prevista,d.data_real,d.status ORDER BY d.data_prevista,d.id`,
        v,
      )
    ).rows;
    return rows.map(map);
  }
  async obter(id: string) {
    const r = await this.pool.query<Row>(
      `${SELECT} WHERE d.id=$1 GROUP BY d.id,c.id,c.ano,c.mes,g.id,g.codigo,g.nome,d.data_prevista,d.data_real,d.status`,
      [id],
    );
    return r.rows[0] ? map(r.rows[0]) : null;
  }
  async remarcar(i: {
    id: string;
    novaData: string;
    motivo: string;
    usuarioId: string;
  }) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const r = await c.query<{ data_prevista: string; status: string }>(
        "SELECT data_prevista::text,status FROM pastoral.distribuicoes WHERE id=$1 FOR UPDATE",
        [i.id],
      );
      const row = r.rows[0];
      if (!row)
        throw new DomainError(
          "DISTRIBUICAO_NAO_ENCONTRADA",
          "Distribuição não encontrada",
        );
      if (!["PLANEJADA", "PREPARADA"].includes(row.status))
        throw new DomainError(
          "DISTRIBUICAO_NAO_REMARCAVEL",
          "Distribuição não pode ser remarcada",
        );
      await c.query(
        "UPDATE pastoral.distribuicoes SET data_prevista=$2,atualizado_em=now() WHERE id=$1",
        [i.id, i.novaData],
      );
      await c.query(
        "INSERT INTO pastoral.distribuicoes_historico(distribuicao_id,tipo_evento,data_anterior,data_nova,motivo,usuario_id) VALUES($1,'REMARCACAO',$2,$3,$4,$5)",
        [i.id, row.data_prevista, i.novaData, i.motivo, i.usuarioId],
      );
      await c.query(
        "INSERT INTO pastoral.auditoria(usuario_id,entidade,entidade_id,operacao,estado_anterior,estado_novo,motivo) VALUES($1,'DISTRIBUICAO',$2,'REMARCACAO',$3,$4,$5)",
        [
          i.usuarioId,
          i.id,
          { dataPrevista: row.data_prevista },
          { dataPrevista: i.novaData },
          i.motivo,
        ],
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
function map(r: Row): DistribuicaoOutput {
  return {
    id: r.id,
    competencia: { id: r.competencia_id, ano: r.ano, mes: r.mes },
    grupo: { id: r.grupo_id, codigo: r.codigo, nome: r.nome },
    dataPrevista: r.data_prevista,
    dataReal: r.data_real,
    status: r.status,
    previstos: Number(r.previstos),
    checkIns: Number(r.check_ins),
    regularesPresentes: Number(r.regulares),
    pendentesPresentes: Number(r.pendentes),
    retiradas: Number(r.retiradas),
    ausentes: Number(r.ausentes),
    naoAtendidosEstoque: Number(r.nao_estoque),
    naoAtendidosIrregularidade: Number(r.nao_irregularidade),
    cestasLiberadas: Number(r.cestas_liberadas),
    cestasConsumidas: Number(r.cestas_consumidas),
    cestasRetornadas: Number(r.cestas_retornadas),
    cestasDisponiveis: Number(r.cestas_disponiveis),
  };
}
