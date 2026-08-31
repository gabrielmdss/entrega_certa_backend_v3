import type { Pool, PoolClient } from "pg";
import type { PlanejamentoPort } from "../../../../application/planejamento/ports/planejamento.port.js";
import { DomainError } from "../../../../shared/errors/domain-error.js";
export class PostgresPlanejamento implements PlanejamentoPort {
  constructor(private pool: Pool) {}
  async simular(i: Parameters<PlanejamentoPort["simular"]>[0]) {
    const itens = (
      await this.pool.query<RowSim>(
        `SELECT mi.apresentacao_insumo_id::text,mi.quantidade::int quantidade_por_cesta,s.insumo,s.apresentacao,COALESCE(d.saldo_fisico,0)::text,COALESCE(d.saldo_reservado,0)::text,COALESCE(d.saldo_disponivel,0)::text FROM pastoral.modelos_cesta_versoes_itens mi JOIN pastoral.vw_saldo_insumos s ON s.apresentacao_insumo_id=mi.apresentacao_insumo_id LEFT JOIN pastoral.vw_disponibilidade_insumos d ON d.apresentacao_insumo_id=mi.apresentacao_insumo_id WHERE mi.modelo_cesta_versao_id=$1 ORDER BY mi.id`,
        [i.modeloCestaVersaoId],
      )
    ).rows;
    if (!itens.length)
      throw new DomainError(
        "MODELO_VERSAO_NAO_ENCONTRADO",
        "Versão não encontrada",
      );
    const mapped = itens.map((x) => {
      const necessario = x.quantidade_por_cesta * i.quantidade,
        disponivel = Number(x.saldo_disponivel);
      return {
        apresentacaoInsumoId: x.apresentacao_insumo_id,
        insumo: x.insumo,
        apresentacao: x.apresentacao,
        quantidadePorCesta: x.quantidade_por_cesta,
        necessidade: necessario,
        saldoFisico: Number(x.saldo_fisico),
        saldoReservado: Number(x.saldo_reservado),
        saldoDisponivel: disponivel,
        deficit: Math.max(0, necessario - disponivel),
        capacidade: Math.floor(disponivel / x.quantidade_por_cesta),
      };
    });
    const capacidade = Math.min(...mapped.map((x) => x.capacidade));
    return {
      competenciaId: i.competenciaId,
      modeloCestaVersaoId: i.modeloCestaVersaoId,
      quantidade: i.quantidade,
      capacidadeMaxima: capacidade,
      cobertura: Math.min(1, capacidade / i.quantidade),
      itensLimitantes: mapped
        .filter((x) => x.capacidade === capacidade)
        .map((x) => x.apresentacaoInsumoId),
      itens: mapped,
    };
  }
  async criar(i: Parameters<PlanejamentoPort["criar"]>[0]) {
    return this.tx(async (c) => {
      const v = (
        await c.query<{ modelo_id: string }>(
          "SELECT modelo_cesta_id::text modelo_id FROM pastoral.modelos_cesta_versoes WHERE id=$1",
          [i.modeloCestaVersaoId],
        )
      ).rows[0];
      if (!v)
        throw new DomainError(
          "MODELO_VERSAO_NAO_ENCONTRADO",
          "Versão não encontrada",
        );
      let p = (
        await c.query<{ id: string }>(
          "INSERT INTO pastoral.planejamentos_cesta(competencia_id,modelo_cesta_id) VALUES($1,$2) ON CONFLICT(competencia_id,modelo_cesta_id) DO NOTHING RETURNING id::text",
          [i.competenciaId, v.modelo_id],
        )
      ).rows[0]?.id;
      if (!p)
        p = (
          await c.query<{ id: string }>(
            "SELECT id::text FROM pastoral.planejamentos_cesta WHERE competencia_id=$1 AND modelo_cesta_id=$2",
            [i.competenciaId, v.modelo_id],
          )
        ).rows[0]?.id;
      if (!p) throw new Error("Falha ao criar planejamento");
      const numero = Number(
        (
          await c.query<{ n: number }>(
            "SELECT COALESCE(max(numero_versao),0)+1 n FROM pastoral.planejamentos_cesta_versoes WHERE planejamento_cesta_id=$1",
            [p],
          )
        ).rows[0]?.n ?? 1,
      );
      const r = await c.query<{ id: string }>(
        "INSERT INTO pastoral.planejamentos_cesta_versoes(planejamento_cesta_id,numero_versao,quantidade_planejada) VALUES($1,$2,$3) RETURNING id::text",
        [p, numero, i.quantidade],
      );
      const id = r.rows[0]?.id ?? "";
      await c.query(
        "INSERT INTO pastoral.planejamentos_cesta_versoes_itens(planejamento_versao_id,apresentacao_insumo_id,quantidade_por_cesta) SELECT $1,apresentacao_insumo_id,quantidade FROM pastoral.modelos_cesta_versoes_itens WHERE modelo_cesta_versao_id=$2",
        [id, i.modeloCestaVersaoId],
      );
      return { id: p, versaoId: id };
    });
  }
  async listar() {
    return (
      await this.pool.query(`${PLAN} ORDER BY c.ano DESC,c.mes DESC,p.id DESC`)
    ).rows;
  }
  async obter(id: string) {
    const p = (await this.pool.query(`${PLAN} WHERE p.id=$1`, [id])).rows[0];
    if (!p) return null;
    const versoes = (
      await this.pool.query(
        `SELECT v.id::text,v.numero_versao "numeroVersao",v.quantidade_planejada "quantidadePlanejada",v.status,v.usuario_aprovador_id::text "usuarioAprovadorId",v.aprovado_em "aprovadoEm",v.motivo_revisao "motivoRevisao",COALESCE(json_agg(json_build_object('apresentacaoInsumoId',i.apresentacao_insumo_id::text,'quantidadePorCesta',i.quantidade_por_cesta,'reservado',r.quantidade_reservada,'consumido',r.quantidade_consumida)) FILTER(WHERE i.id IS NOT NULL),'[]') itens FROM pastoral.planejamentos_cesta_versoes v LEFT JOIN pastoral.planejamentos_cesta_versoes_itens i ON i.planejamento_versao_id=v.id LEFT JOIN pastoral.reservas_insumos r ON r.planejamento_versao_id=v.id AND r.apresentacao_insumo_id=i.apresentacao_insumo_id WHERE v.planejamento_cesta_id=$1 GROUP BY v.id ORDER BY v.numero_versao`,
        [id],
      )
    ).rows.map((x) => ({
      ...x,
      aprovadoEm: x.aprovadoEm ? (x.aprovadoEm as Date).toISOString() : null,
    }));
    return { ...p, versoes };
  }
  async aprovar(i: Parameters<PlanejamentoPort["aprovar"]>[0]) {
    await this.tx(async (c) => {
      const v = (
        await c.query<{ id: string }>(
          "SELECT id::text FROM pastoral.planejamentos_cesta_versoes WHERE planejamento_cesta_id=$1 AND status='SIMULACAO' ORDER BY numero_versao DESC LIMIT 1",
          [i.id],
        )
      ).rows[0];
      if (!v)
        throw new DomainError(
          "PLANEJAMENTO_SEM_VERSAO_PENDENTE",
          "Planejamento sem versão pendente",
        );
      await c.query("SET LOCAL search_path TO pastoral,public");
      try {
        await c.query("SELECT pastoral.aprovar_planejamento($1,$2)", [
          v.id,
          i.usuarioId,
        ]);
      } catch (e) {
        throw new DomainError(
          "SALDO_INSUFICIENTE",
          e instanceof Error ? e.message : "Aprovação inválida",
        );
      }
    });
  }
  async revisar(i: Parameters<PlanejamentoPort["revisar"]>[0]) {
    return this.tx(async (c) => {
      const p = (
        await c.query<{ modelo_id: string }>(
          "SELECT modelo_cesta_id::text modelo_id FROM pastoral.planejamentos_cesta WHERE id=$1 FOR UPDATE",
          [i.id],
        )
      ).rows[0];
      if (!p)
        throw new DomainError(
          "PLANEJAMENTO_NAO_ENCONTRADO",
          "Planejamento não encontrado",
        );
      if (
        !(
          await c.query(
            "SELECT 1 FROM pastoral.modelos_cesta_versoes WHERE id=$1 AND modelo_cesta_id=$2",
            [i.modeloCestaVersaoId, p.modelo_id],
          )
        ).rowCount
      )
        throw new DomainError(
          "MODELO_VERSAO_INCOMPATIVEL",
          "Versão pertence a outro modelo",
        );
      const numero = Number(
        (
          await c.query<{ n: number }>(
            "SELECT COALESCE(max(numero_versao),0)+1 n FROM pastoral.planejamentos_cesta_versoes WHERE planejamento_cesta_id=$1",
            [i.id],
          )
        ).rows[0]?.n ?? 1,
      );
      const r = await c.query<{ id: string }>(
        "INSERT INTO pastoral.planejamentos_cesta_versoes(planejamento_cesta_id,numero_versao,quantidade_planejada,motivo_revisao) VALUES($1,$2,$3,$4) RETURNING id::text",
        [i.id, numero, i.quantidade, i.motivo],
      );
      const id = r.rows[0]?.id ?? "";
      await c.query(
        "INSERT INTO pastoral.planejamentos_cesta_versoes_itens(planejamento_versao_id,apresentacao_insumo_id,quantidade_por_cesta) SELECT $1,apresentacao_insumo_id,quantidade FROM pastoral.modelos_cesta_versoes_itens WHERE modelo_cesta_versao_id=$2",
        [id, i.modeloCestaVersaoId],
      );
      return { versaoId: id };
    });
  }
  private async tx<T>(op: (c: PoolClient) => Promise<T>) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const r = await op(c);
      await c.query("COMMIT");
      return r;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
}
interface RowSim {
  apresentacao_insumo_id: string;
  quantidade_por_cesta: number;
  insumo: string;
  apresentacao: string;
  saldo_fisico: string;
  saldo_reservado: string;
  saldo_disponivel: string;
}
const PLAN = `SELECT p.id::text,p.competencia_id::text "competenciaId",c.ano,c.mes,p.modelo_cesta_id::text "modeloCestaId",m.nome modelo,p.criado_em "criadoEm" FROM pastoral.planejamentos_cesta p JOIN pastoral.competencias c ON c.id=p.competencia_id JOIN pastoral.modelos_cesta m ON m.id=p.modelo_cesta_id`;
