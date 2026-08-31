import type { Pool, PoolClient } from "pg";
import type { CestasPort } from "../../../../application/cestas/ports/cestas.port.js";
import { DomainError } from "../../../../shared/errors/domain-error.js";
export class PostgresCestas implements CestasPort {
  constructor(private pool: Pool) {}
  async listarModelos() {
    return (
      await this.pool.query(
        "SELECT id::text,nome,tipo,ativo,criado_em FROM pastoral.modelos_cesta ORDER BY nome,id",
      )
    ).rows.map((x) => ({
      ...x,
      criadoEm: (x.criado_em as Date).toISOString(),
      criado_em: undefined,
    }));
  }
  async obterModelo(id: string) {
    const m = (
      await this.pool.query(
        "SELECT id::text,nome,tipo,ativo,criado_em FROM pastoral.modelos_cesta WHERE id=$1",
        [id],
      )
    ).rows[0];
    if (!m) return null;
    const v = (
      await this.pool.query(
        `SELECT mv.id::text,mv.numero_versao "numeroVersao",mv.meta_itens "metaItens",mv.usuario_id::text "usuarioId",mv.criado_em "criadoEm",COALESCE(json_agg(json_build_object('apresentacaoInsumoId',mi.apresentacao_insumo_id::text,'quantidade',mi.quantidade,'insumo',s.insumo,'apresentacao',s.apresentacao)) FILTER(WHERE mi.id IS NOT NULL),'[]') itens FROM pastoral.modelos_cesta_versoes mv LEFT JOIN pastoral.modelos_cesta_versoes_itens mi ON mi.modelo_cesta_versao_id=mv.id LEFT JOIN pastoral.vw_saldo_insumos s ON s.apresentacao_insumo_id=mi.apresentacao_insumo_id WHERE mv.modelo_cesta_id=$1 GROUP BY mv.id ORDER BY mv.numero_versao`,
        [id],
      )
    ).rows.map((x) => ({ ...x, criadoEm: (x.criadoEm as Date).toISOString() }));
    return {
      id: m.id,
      nome: m.nome,
      tipo: m.tipo,
      ativo: m.ativo,
      criadoEm: (m.criado_em as Date).toISOString(),
      versoes: v,
    };
  }
  async criarModelo(i: Parameters<CestasPort["criarModelo"]>[0]) {
    try {
      const r = await this.pool.query<{ id: string }>(
        "INSERT INTO pastoral.modelos_cesta(nome,tipo) VALUES($1,$2) RETURNING id::text",
        [i.nome, i.tipo],
      );
      return { id: r.rows[0]?.id ?? "" };
    } catch (e) {
      throw new DomainError(
        "MODELO_CESTA_JA_EXISTE",
        e instanceof Error ? e.message : "Modelo já existe",
      );
    }
  }
  async criarVersao(i: Parameters<CestasPort["criarVersao"]>[0]) {
    return this.tx(async (c) => {
      await c.query(
        "SELECT id FROM pastoral.modelos_cesta WHERE id=$1 FOR UPDATE",
        [i.modeloId],
      );
      if (
        new Set(i.itens.map((x) => x.apresentacaoInsumoId)).size !==
        i.itens.length
      )
        throw new DomainError("ITEM_DUPLICADO", "Item duplicado");
      if (i.itens.reduce((s, x) => s + x.quantidade, 0) !== i.metaItens)
        throw new DomainError(
          "META_ITENS_INCONSISTENTE",
          "Meta deve ser a soma das quantidades",
        );
      const numero = Number(
        (
          await c.query<{ n: number }>(
            "SELECT COALESCE(max(numero_versao),0)+1 n FROM pastoral.modelos_cesta_versoes WHERE modelo_cesta_id=$1",
            [i.modeloId],
          )
        ).rows[0]?.n ?? 1,
      );
      const r = await c.query<{ id: string }>(
        "INSERT INTO pastoral.modelos_cesta_versoes(modelo_cesta_id,numero_versao,meta_itens,usuario_id) VALUES($1,$2,$3,$4) RETURNING id::text",
        [i.modeloId, numero, i.metaItens, i.usuarioId],
      );
      const id = r.rows[0]?.id ?? "";
      for (const x of i.itens)
        await c.query(
          "INSERT INTO pastoral.modelos_cesta_versoes_itens(modelo_cesta_versao_id,apresentacao_insumo_id,quantidade) VALUES($1,$2,$3)",
          [id, x.apresentacaoInsumoId, x.quantidade],
        );
      return { id, numeroVersao: numero };
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
