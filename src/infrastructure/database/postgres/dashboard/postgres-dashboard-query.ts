import type { Pool } from "pg";
import {
  calcularCobertura,
  percentual,
  statusCobertura,
  type CoverageInput,
  type DashboardQueryPort,
} from "../../../../application/dashboard/ports/dashboard-query.port.js";

const n = (value: unknown) => Number(value ?? 0);
const id = (value: unknown) => (value == null ? null : String(value));

export class PostgresDashboardQuery implements DashboardQueryPort {
  constructor(private readonly pool: Pool) {}

  async obter(): Promise<unknown> {
    const [capacidade, proxima, competencia, estoque] = await Promise.all([
      this.pool.query(`
        SELECT capacidade::int, beneficiarios_ativos::int,
          (SELECT count(*)::int FROM pastoral.candidaturas WHERE status IN ('AGUARDANDO','CONVOCADO')) lista_espera
        FROM pastoral.vw_capacidade_atual`),
      this.pool.query(`
        SELECT d.id::text, d.competencia_id::text, d.data_prevista::text data, d.status,
          g.codigo grupo,
          count(db.id)::int previstos,
          count(DISTINCT ci.id)::int check_ins,
          count(DISTINCT r.id) FILTER (WHERE r.status='VALIDA')::int retiradas,
          COALESCE(l.quantidade_liberada,0)::int cestas_liberadas
        FROM pastoral.distribuicoes d
        JOIN pastoral.grupos_distribuicao g ON g.id=d.grupo_distribuicao_id
        LEFT JOIN pastoral.direitos_beneficio db ON db.distribuicao_prevista_id=d.id
        LEFT JOIN pastoral.distribuicoes_checkins ci ON ci.distribuicao_id=d.id
        LEFT JOIN pastoral.retiradas r ON r.distribuicao_id=d.id
        LEFT JOIN pastoral.vw_cestas_liberadas_distribuicao l ON l.distribuicao_id=d.id
        WHERE d.status='ABERTA' OR (d.status IN ('PLANEJADA','PREPARADA') AND d.data_prevista >= CURRENT_DATE)
        GROUP BY d.id,g.codigo,l.quantidade_liberada
        ORDER BY CASE WHEN d.status='ABERTA' THEN 0 ELSE 1 END,d.data_prevista,d.id LIMIT 1`),
      this.pool.query(`
        WITH escolhida AS (
          SELECT c.* FROM pastoral.competencias c
          ORDER BY CASE WHEN c.ano=EXTRACT(year FROM CURRENT_DATE) AND c.mes=EXTRACT(month FROM CURRENT_DATE) THEN 0 ELSE 1 END,
            CASE WHEN make_date(c.ano,c.mes,1)<=CURRENT_DATE THEN 0 ELSE 1 END,
            make_date(c.ano,c.mes,1) DESC LIMIT 1
        )
        SELECT e.id::text, e.ano::int, e.mes::int, e.status,
          count(db.id)::int direitos,
          count(db.id) FILTER(WHERE db.status='RETIRADO')::int retirados,
          count(db.id) FILTER(WHERE db.status='DISPONIVEL')::int disponiveis,
          count(db.id) FILTER(WHERE db.status IN ('AUSENTE','AUSENTE_JUSTIFICADO','AUSENTE_NAO_JUSTIFICADO'))::int ausentes,
          count(db.id) FILTER(WHERE db.status='NAO_ATENDIDO_ESTOQUE')::int nao_estoque,
          count(db.id) FILTER(WHERE db.status='NAO_ATENDIDO_IRREGULARIDADE')::int nao_irregularidade,
          COALESCE((SELECT sum(v.quantidade_planejada) FROM pastoral.planejamentos_cesta p JOIN pastoral.planejamentos_cesta_versoes v ON v.planejamento_cesta_id=p.id AND v.status IN ('APROVADA','CONCLUIDA') WHERE p.competencia_id=e.id),0)::int planejado,
          COALESCE((SELECT sum(lm.quantidade_montada) FROM pastoral.lotes_montagem lm JOIN pastoral.planejamentos_cesta_versoes v ON v.id=lm.planejamento_versao_id JOIN pastoral.planejamentos_cesta p ON p.id=v.planejamento_cesta_id WHERE p.competencia_id=e.id),0)::int montado,
          COALESCE((SELECT count(*) FROM pastoral.retiradas r JOIN pastoral.direitos_beneficio dr ON dr.id=r.direito_beneficio_id WHERE dr.competencia_id=e.id AND r.status='VALIDA'),0)::int entregue
        FROM escolhida e LEFT JOIN pastoral.direitos_beneficio db ON db.competencia_id=e.id
        GROUP BY e.id,e.ano,e.mes,e.status`),
      this.pool.query(`
        SELECT
          count(DISTINCT i.id) FILTER(WHERE i.ativo)::int insumos_ativos,
          count(DISTINCT d.apresentacao_insumo_id) FILTER(WHERE d.saldo_fisico>0)::int itens_com_estoque,
          COALESCE((SELECT sum(quantidade_disponivel) FROM pastoral.lotes_montagem WHERE status='ATIVO'),0)::int cestas_montadas,
          COALESCE((SELECT sum(quantidade_liberada-quantidade_consumida-quantidade_retornada) FROM pastoral.distribuicoes_liberacoes_cestas dl JOIN pastoral.distribuicoes di ON di.id=dl.distribuicao_id WHERE di.status<>'ENCERRADA'),0)::int cestas_reservadas
        FROM pastoral.insumos i
        LEFT JOIN pastoral.insumos_apresentacoes a ON a.insumo_id=i.id
        LEFT JOIN pastoral.vw_disponibilidade_insumos d ON d.apresentacao_insumo_id=a.id`),
    ]);

    const cap = capacidade.rows[0] ?? {};
    const prox = proxima.rows[0] as Record<string, unknown> | undefined;
    const comp = competencia.rows[0] as Record<string, unknown> | undefined;
    const stock = estoque.rows[0] ?? {};
    const coverage = await this.coverage(prox?.competencia_id, prox?.id);
    const currentCoverage = await this.coverage(comp?.id, null);
    const demanda = prox ? n(prox.previstos) : 0;
    const calculada = calcularCobertura({
      demanda,
      cestasMontadas: coverage.montadas,
      itens: coverage.itens,
    });
    const capacidadeGarantida = Math.min(
      calculada.capacidadeGarantida,
      demanda,
    );
    const demandaAtual = n(comp?.direitos);
    const coberturaAtual = calcularCobertura({
      demanda: demandaAtual,
      cestasMontadas: currentCoverage.montadas,
      itens: currentCoverage.itens,
    });
    const capacidadeAtual = Math.min(
      coberturaAtual.capacidadeGarantida,
      demandaAtual,
    );
    const projecao = await this.projecao(coverage, cap, comp);
    const criticos = calculada.insumos
      .filter((i) => i.deficit > 0)
      .sort((a, b) => a.capacidade - b.capacidade || b.deficit - a.deficit);
    const saudeStatus = statusCobertura(
      capacidadeGarantida,
      demanda,
      coverage.itens.length > 0,
    );
    const alertas = [] as Array<{
      codigo: string;
      nivel: string;
      mensagem: string;
    }>;
    if (demanda > capacidadeGarantida)
      alertas.push({
        codigo: "DEFICIT_PROXIMA_DISTRIBUICAO",
        nivel: saudeStatus === "CRITICO" ? "CRITICO" : "ATENCAO",
        mensagem: `Faltam ${demanda - capacidadeGarantida} cestas para cobrir a próxima distribuição.`,
      });
    for (const item of criticos.filter((i) => i.deficit > 0).slice(0, 5))
      alertas.push({
        codigo: "INSUMO_CRITICO",
        nivel: "ATENCAO",
        mensagem: `${item.nome} ${item.apresentacao} possui déficit de ${item.deficit} unidades.`,
      });

    return {
      beneficiarios: {
        capacidade: n(cap.capacidade),
        ativos: n(cap.beneficiarios_ativos),
        vagas: Math.max(n(cap.capacidade) - n(cap.beneficiarios_ativos), 0),
        excedente: Math.max(n(cap.beneficiarios_ativos) - n(cap.capacidade), 0),
        listaEspera: n(cap.lista_espera),
      },
      proximaDistribuicao: prox
        ? {
            id: id(prox.id),
            data: prox.data,
            grupo: prox.grupo,
            status: prox.status,
            previstos: demanda,
            checkIns: n(prox.check_ins),
            retiradas: n(prox.retiradas),
            cestasMontadasCompativeis: coverage.montadas,
            cestasLiberadas: n(prox.cestas_liberadas),
          }
        : null,
      saude: {
        proximaDistribuicao: {
          demanda,
          capacidadeGarantida,
          coberturaPercentual: percentual(capacidadeGarantida, demanda),
          deficitCestas: Math.max(demanda - capacidadeGarantida, 0),
          status: saudeStatus,
        },
        competenciaAtual: {
          demanda: demandaAtual,
          capacidadeGarantida: capacidadeAtual,
          coberturaPercentual: percentual(capacidadeAtual, demandaAtual),
          deficitCestas: Math.max(demandaAtual - capacidadeAtual, 0),
          status: statusCobertura(
            capacidadeAtual,
            demandaAtual,
            currentCoverage.itens.length > 0,
          ),
        },
        competenciaSeguinte: projecao[comp?.status === "ENCERRADA" ? 0 : 1]
          ? {
              demanda:
                projecao[comp?.status === "ENCERRADA" ? 0 : 1]?.demanda ?? 0,
              capacidadeGarantida:
                projecao[comp?.status === "ENCERRADA" ? 0 : 1]
                  ?.capacidadeGarantida ?? 0,
              coberturaPercentual:
                projecao[comp?.status === "ENCERRADA" ? 0 : 1]
                  ?.coberturaGarantida ?? 0,
              status: statusCobertura(
                projecao[comp?.status === "ENCERRADA" ? 0 : 1]
                  ?.capacidadeGarantida ?? 0,
                projecao[comp?.status === "ENCERRADA" ? 0 : 1]?.demanda ?? 0,
                coverage.itens.length > 0,
              ),
            }
          : null,
      },
      competenciaAtual: comp
        ? {
            id: id(comp.id),
            competencia: `${comp.ano}-${String(comp.mes).padStart(2, "0")}`,
            status: comp.status,
            demanda: n(comp.direitos),
            direitos: n(comp.direitos),
            retirados: n(comp.retirados),
            disponiveis: n(comp.disponiveis),
            ausentes: n(comp.ausentes),
            naoAtendidosEstoque: n(comp.nao_estoque),
            naoAtendidosIrregularidade: n(comp.nao_irregularidade),
            planejado: n(comp.planejado),
            montado: n(comp.montado),
            entregue: n(comp.entregue),
          }
        : null,
      competenciaSeguinte:
        projecao[comp?.status === "ENCERRADA" ? 0 : 1] ?? null,
      projecaoTresMeses: projecao,
      insumosCriticos: criticos,
      estoque: {
        insumosAtivos: n(stock.insumos_ativos),
        itensComEstoque: n(stock.itens_com_estoque),
        itensCriticos: criticos.filter((i) => i.deficit > 0).length,
        cestasMontadas: n(stock.cestas_montadas),
        cestasReservadasParaDistribuicoes: n(stock.cestas_reservadas),
      },
      alertas,
      metodologia: {
        coberturaGarantida:
          "cestas compatíveis disponíveis (inclusive liberadas ainda não consumidas) + mínimo, por item, do estoque físico descontadas apenas reservas de outros planos",
        coberturaProjetada:
          "cobertura garantida + média mensal de entradas dos 3 meses completos anteriores; projeção linear, determinística e não garantida",
      },
    };
  }

  private async coverage(
    competenciaId: unknown,
    distribuicaoId: unknown,
  ): Promise<{ montadas: number; itens: CoverageInput["itens"] }> {
    if (!competenciaId) return { montadas: 0, itens: [] };
    const plan = await this.pool.query(
      `SELECT v.id::text FROM pastoral.planejamentos_cesta p JOIN pastoral.modelos_cesta m ON m.id=p.modelo_cesta_id JOIN pastoral.planejamentos_cesta_versoes v ON v.planejamento_cesta_id=p.id AND v.status='APROVADA' WHERE p.competencia_id=$1 AND m.tipo='REGULAR' ORDER BY v.aprovado_em DESC NULLS LAST,v.id DESC LIMIT 1`,
      [competenciaId],
    );
    const version = plan.rows[0]?.id;
    if (!version) return { montadas: 0, itens: [] };
    const [mounted, items] = await Promise.all([
      this.pool.query(
        `SELECT (
          COALESCE((SELECT sum(quantidade_disponivel) FROM pastoral.lotes_montagem WHERE planejamento_versao_id=$1 AND status='ATIVO'),0)
          + COALESCE((SELECT sum(dl.quantidade_liberada-dl.quantidade_consumida-dl.quantidade_retornada)
            FROM pastoral.distribuicoes_liberacoes_cestas dl JOIN pastoral.lotes_montagem lm ON lm.id=dl.lote_montagem_id
            WHERE dl.distribuicao_id=$2 AND lm.planejamento_versao_id=$1),0)
        )::int n`,
        [version, distribuicaoId],
      ),
      this.pool.query(
        `
        SELECT pi.apresentacao_insumo_id::text, i.nome, a.descricao apresentacao, pi.quantidade_por_cesta::int,
          d.saldo_fisico::int fisico,
          COALESCE(ra.total,0)::int reservado_total,
          GREATEST(COALESCE(ra.total,0)-COALESCE(rp.propria,0),0)::int reservado_outros,
          COALESCE(rp.propria,0)::int reserva_propria,
          COALESCE(hist.media,0)::numeric entrada_media
        FROM pastoral.planejamentos_cesta_versoes_itens pi
        JOIN pastoral.insumos_apresentacoes a ON a.id=pi.apresentacao_insumo_id JOIN pastoral.insumos i ON i.id=a.insumo_id
        JOIN pastoral.vw_saldo_insumos d ON d.apresentacao_insumo_id=a.id
        LEFT JOIN (SELECT apresentacao_insumo_id,sum(quantidade_reservada-quantidade_consumida-quantidade_liberada) total FROM pastoral.reservas_insumos r JOIN pastoral.planejamentos_cesta_versoes v ON v.id=r.planejamento_versao_id WHERE v.status='APROVADA' GROUP BY apresentacao_insumo_id) ra ON ra.apresentacao_insumo_id=a.id
        LEFT JOIN (SELECT apresentacao_insumo_id,sum(quantidade_reservada-quantidade_consumida-quantidade_liberada) propria FROM pastoral.reservas_insumos WHERE planejamento_versao_id=$1 GROUP BY apresentacao_insumo_id) rp ON rp.apresentacao_insumo_id=a.id
        LEFT JOIN (SELECT apresentacao_insumo_id,sum(quantidade)::numeric/3 media FROM pastoral.movimentacoes_insumos WHERE tipo='ENTRADA' AND sentido=1 AND ocorrido_em>=date_trunc('month',CURRENT_DATE)-interval '3 months' AND ocorrido_em<date_trunc('month',CURRENT_DATE) GROUP BY apresentacao_insumo_id) hist ON hist.apresentacao_insumo_id=a.id
        WHERE pi.planejamento_versao_id=$1 ORDER BY i.nome,a.descricao`,
        [version],
      ),
    ]);
    return {
      montadas: n(mounted.rows[0]?.n),
      itens: items.rows.map((r) => ({
        apresentacaoInsumoId: String(r.apresentacao_insumo_id),
        nome: String(r.nome),
        apresentacao: String(r.apresentacao),
        quantidadePorCesta: n(r.quantidade_por_cesta),
        fisico: n(r.fisico),
        reservadoTotal: n(r.reservado_total),
        reservadoOutros: n(r.reservado_outros),
        reservaPropria: n(r.reserva_propria),
        entradaMediaMensal: n(r.entrada_media),
      })),
    };
  }

  private async projecao(
    coverage: { montadas: number; itens: CoverageInput["itens"] },
    cap: Record<string, unknown>,
    comp: Record<string, unknown> | undefined,
  ) {
    const active = n(cap.beneficiarios_ativos);
    const currentClosed = comp?.status === "ENCERRADA";
    return Array.from({ length: 3 }, (_, index) => {
      const offset = index + (currentClosed ? 1 : 0),
        d = new Date();
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + offset);
      const c = calcularCobertura(
        {
          demanda: active,
          cestasMontadas: coverage.montadas,
          itens: coverage.itens,
        },
        offset,
      );
      return {
        competencia: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
        demanda: active,
        capacidadeGarantida: Math.min(c.capacidadeGarantida, active),
        coberturaGarantida: percentual(c.capacidadeGarantida, active),
        capacidadeProjetada: Math.min(c.capacidadeProjetada, active),
        coberturaProjetada: percentual(c.capacidadeProjetada, active),
      };
    });
  }
}
