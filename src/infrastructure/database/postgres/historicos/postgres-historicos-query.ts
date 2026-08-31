import type { Pool } from "pg";
import type { HistoricosQueryPort } from "../../../../application/historicos/ports/historicos-query.port.js";
export class PostgresHistoricosQuery implements HistoricosQueryPort {
  constructor(private readonly pool: Pool) {}
  async beneficiario(id: string) {
    const exists = (
      await this.pool.query(
        "SELECT p.nome_completo FROM pastoral.beneficiarios b JOIN pastoral.pessoas p ON p.id=b.pessoa_id WHERE b.id=$1",
        [id],
      )
    ).rows[0];
    if (!exists) return null;
    const events = (
      await this.pool.query(
        `
SELECT * FROM (
 SELECT 'ADMISSAO' tipo,b.data_admissao::timestamptz "ocorridoEm",jsonb_build_object('grupoId',b.grupo_distribuicao_id::text) detalhes FROM pastoral.beneficiarios b WHERE b.id=$1
 UNION ALL SELECT 'ALTERACAO_GRUPO',h.vigencia_inicio,jsonb_build_object('grupoOrigem',go.codigo,'grupoDestino',gd.codigo,'motivo',h.motivo) FROM pastoral.beneficiarios_grupos_historico h LEFT JOIN pastoral.grupos_distribuicao go ON go.id=h.grupo_origem_id JOIN pastoral.grupos_distribuicao gd ON gd.id=h.grupo_destino_id WHERE h.beneficiario_id=$1
 UNION ALL SELECT CASE WHEN r.status='ESTORNADA' THEN 'RETIRADA_ESTORNADA' ELSE 'RETIRADA' END,r.ocorrido_em,jsonb_build_object('retiradaId',r.id::text,'distribuicaoId',r.distribuicao_id::text,'tipo',r.tipo) FROM pastoral.retiradas r WHERE r.beneficiario_id=$1
 UNION ALL SELECT 'AUSENCIA',a.identificado_em,jsonb_build_object('ausenciaId',a.id::text,'status',a.status,'competenciaId',db.competencia_id::text) FROM pastoral.ausencias a JOIN pastoral.direitos_beneficio db ON db.id=a.direito_beneficio_id WHERE db.beneficiario_id=$1
 UNION ALL SELECT 'JUSTIFICATIVA',j.data_apresentacao,jsonb_build_object('ausenciaId',a.id::text,'decisao',j.decisao,'momento',j.momento) FROM pastoral.justificativas_ausencia j JOIN pastoral.ausencias a ON a.id=j.ausencia_id JOIN pastoral.direitos_beneficio db ON db.id=a.direito_beneficio_id WHERE db.beneficiario_id=$1
 UNION ALL SELECT 'CESTA_ADICIONAL',ca.autorizado_em,jsonb_build_object('distribuicaoId',ca.distribuicao_id::text,'quantidade',ca.quantidade,'status',ca.status) FROM pastoral.cestas_adicionais ca WHERE ca.beneficiario_id=$1
 UNION ALL SELECT 'DESLIGAMENTO',bd.ocorrido_em,jsonb_build_object('motivo',md.descricao,'observacao',bd.observacao) FROM pastoral.beneficiarios_desligamentos bd JOIN pastoral.motivos_desligamento md ON md.id=bd.motivo_desligamento_id WHERE bd.beneficiario_id=$1
 UNION ALL SELECT 'REATIVACAO',a.ocorrido_em,jsonb_build_object('motivo',a.motivo) FROM pastoral.auditoria a WHERE a.entidade='BENEFICIARIO' AND a.entidade_id=$1 AND a.operacao='REATIVACAO'
) eventos ORDER BY "ocorridoEm" DESC,tipo`,
        [id],
      )
    ).rows;
    return {
      beneficiario: { id, nome: exists.nome_completo },
      eventos: events,
    };
  }
  async distribuicao(id: string) {
    const dist = (
      await this.pool.query(
        "SELECT d.id::text,d.data_prevista::text data,g.codigo grupo FROM pastoral.distribuicoes d JOIN pastoral.grupos_distribuicao g ON g.id=d.grupo_distribuicao_id WHERE d.id=$1",
        [id],
      )
    ).rows[0];
    if (!dist) return null;
    const events = (
      await this.pool.query(
        `SELECT * FROM (
 SELECT 'CRIACAO' tipo,d.criado_em "ocorridoEm",jsonb_build_object('data',d.data_prevista::text,'statusInicial','PLANEJADA') detalhes FROM pastoral.distribuicoes d WHERE d.id=$1
 UNION ALL SELECT 'REMARCACAO',h.ocorrido_em,jsonb_build_object('dataAnterior',h.data_anterior::text,'dataNova',h.data_nova::text,'motivo',h.motivo) FROM pastoral.distribuicoes_historico h WHERE h.distribuicao_id=$1
 UNION ALL SELECT 'ABERTURA',d.abertura_em,jsonb_build_object('status','ABERTA') FROM pastoral.distribuicoes d WHERE d.id=$1 AND d.abertura_em IS NOT NULL
 UNION ALL SELECT 'LIBERACAO_CESTAS',l.liberado_em,jsonb_build_object('loteId',l.lote_montagem_id::text,'quantidade',l.quantidade_liberada) FROM pastoral.distribuicoes_liberacoes_cestas l WHERE l.distribuicao_id=$1
 UNION ALL SELECT CASE WHEN r.status='ESTORNADA' THEN 'RETIRADA_ESTORNADA' ELSE 'RETIRADA' END,r.ocorrido_em,jsonb_build_object('retiradaId',r.id::text,'beneficiarioId',r.beneficiario_id::text) FROM pastoral.retiradas r WHERE r.distribuicao_id=$1
 UNION ALL SELECT 'ENCERRAMENTO',d.encerramento_em,jsonb_build_object('status','ENCERRADA') FROM pastoral.distribuicoes d WHERE d.id=$1 AND d.encerramento_em IS NOT NULL
) eventos ORDER BY "ocorridoEm" DESC,tipo`,
        [id],
      )
    ).rows;
    return {
      distribuicao: { id: String(dist.id), data: dist.data, grupo: dist.grupo },
      eventos: events,
    };
  }
}
