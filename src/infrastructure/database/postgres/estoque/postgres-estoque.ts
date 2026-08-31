import type { Pool, PoolClient } from "pg";
import type { EstoquePort } from "../../../../application/estoque/ports/estoque.port.js";
import { DomainError } from "../../../../shared/errors/domain-error.js";
export class PostgresEstoque implements EstoquePort {
  constructor(private pool: Pool) {}
  async listarCategorias() {
    return (
      await this.pool.query(
        'SELECT id::text,codigo,descricao,ordem_prioridade "ordemPrioridade" FROM pastoral.categorias_prioridade_insumo ORDER BY ordem_prioridade,id',
      )
    ).rows;
  }
  async listarInsumos() {
    return (
      await this.pool.query(`${INSUMOS} ORDER BY i.nome,ai.descricao`)
    ).rows.map(mapInsumo);
  }
  async obterInsumo(id: string) {
    const x = (await this.pool.query(`${INSUMOS} WHERE ai.id=$1`, [id]))
      .rows[0];
    return x ? mapInsumo(x) : null;
  }
  async cadastrarInsumo(i: Parameters<EstoquePort["cadastrarInsumo"]>[0]) {
    return this.tx(async (c) => {
      if (
        (
          await c.query(
            "SELECT 1 FROM pastoral.insumos WHERE lower(nome)=lower($1)",
            [i.nome],
          )
        ).rowCount
      )
        throw new DomainError("INSUMO_JA_EXISTE", "Insumo já existe");
      if (
        i.categoriaPrioridadeId &&
        !(
          await c.query(
            "SELECT 1 FROM pastoral.categorias_prioridade_insumo WHERE id=$1",
            [i.categoriaPrioridadeId],
          )
        ).rowCount
      )
        throw new DomainError(
          "CATEGORIA_NAO_ENCONTRADA",
          "Categoria não encontrada",
        );
      const a = await c.query<{ id: string }>(
        "INSERT INTO pastoral.insumos(nome,categoria_prioridade_id) VALUES($1,$2) RETURNING id::text",
        [i.nome, i.categoriaPrioridadeId],
      );
      const id = a.rows[0]?.id;
      if (!id) throw new Error("Falha ao criar insumo");
      const p = await c.query<{ id: string }>(
        "INSERT INTO pastoral.insumos_apresentacoes(insumo_id,descricao,quantidade_referencia,unidade_medida) VALUES($1,$2,$3,$4) RETURNING id::text",
        [
          id,
          i.apresentacao.descricao,
          i.apresentacao.quantidadeReferencia,
          i.apresentacao.unidadeMedida,
        ],
      );
      return { id, apresentacaoId: p.rows[0]?.id ?? "" };
    });
  }
  async listarDoadores() {
    return (
      await this.pool.query(
        "SELECT id::text,tipo,nome,telefone,observacao,ativo,criado_em FROM pastoral.doadores ORDER BY nome,id",
      )
    ).rows.map((x) => ({
      ...x,
      criadoEm: (x.criado_em as Date).toISOString(),
      criado_em: undefined,
    }));
  }
  async criarDoador(i: Parameters<EstoquePort["criarDoador"]>[0]) {
    const r = await this.pool.query<{ id: string }>(
      "INSERT INTO pastoral.doadores(tipo,nome,telefone,observacao) VALUES($1,$2,$3,$4) RETURNING id::text",
      [i.tipo, i.nome, i.telefone, i.observacao],
    );
    return { id: r.rows[0]?.id ?? "" };
  }
  async atualizarDoador(i: Parameters<EstoquePort["atualizarDoador"]>[0]) {
    if (
      !(
        await this.pool.query(
          "UPDATE pastoral.doadores SET tipo=$2,nome=$3,telefone=$4,observacao=$5,ativo=$6 WHERE id=$1",
          [i.id, i.tipo, i.nome, i.telefone, i.observacao, i.ativo],
        )
      ).rowCount
    )
      throw new DomainError("DOADOR_NAO_ENCONTRADO", "Doador não encontrado");
  }
  async registrarEntrada(i: Parameters<EstoquePort["registrarEntrada"]>[0]) {
    return this.tx(async (c) => {
      await schema(c);
      try {
        const r = await c.query<{ id: string }>(
          "SELECT pastoral.registrar_entrada_estoque($1,$2,$3,$4,$5,$6::jsonb)::text id",
          [
            i.tipo,
            i.doadorId,
            i.usuarioId,
            i.dataEntrada,
            i.observacao,
            JSON.stringify(
              i.itens.map((x) => ({
                apresentacao_insumo_id: x.apresentacaoInsumoId,
                quantidade: x.quantidade,
                validade: x.validade,
              })),
            ),
          ],
        );
        return { id: r.rows[0]?.id ?? "" };
      } catch (e) {
        throw dbError(e, "ENTRADA_ESTOQUE_INVALIDA");
      }
    });
  }
  async registrarPerda(i: Parameters<EstoquePort["registrarPerda"]>[0]) {
    return this.tx(async (c) => {
      await schema(c);
      try {
        const r = await c.query<{ id: string }>(
          "SELECT pastoral.registrar_perda_estoque($1,$2,$3,$4,$5)::text id",
          [
            i.apresentacaoInsumoId,
            i.quantidade,
            i.motivoId,
            i.observacao,
            i.usuarioId,
          ],
        );
        return { id: r.rows[0]?.id ?? "" };
      } catch (e) {
        throw dbError(e, "PERDA_ESTOQUE_INVALIDA");
      }
    });
  }
  async criarInventario(usuarioId: string) {
    return this.tx(async (c) => {
      const r = await c.query<{ id: string }>(
        "INSERT INTO pastoral.inventarios(usuario_responsavel_id) VALUES($1) RETURNING id::text",
        [usuarioId],
      );
      const id = r.rows[0]?.id ?? "";
      await c.query(
        `INSERT INTO pastoral.inventarios_itens(inventario_id,apresentacao_insumo_id,saldo_sistema,saldo_fisico) SELECT $1,apresentacao_insumo_id,saldo_fisico,saldo_fisico FROM pastoral.vw_saldo_insumos`,
        [id],
      );
      return { id };
    });
  }
  async obterInventario(id: string) {
    const h = (
      await this.pool.query(
        "SELECT id::text,status,usuario_responsavel_id::text,iniciado_em,concluido_em FROM pastoral.inventarios WHERE id=$1",
        [id],
      )
    ).rows[0];
    if (!h) return null;
    const itens = (
      await this.pool.query(
        'SELECT ii.apresentacao_insumo_id::text "apresentacaoId",s.insumo,s.apresentacao,ii.saldo_sistema "saldoSistema",ii.saldo_fisico "saldoFisico",ii.diferenca FROM pastoral.inventarios_itens ii JOIN pastoral.vw_saldo_insumos s ON s.apresentacao_insumo_id=ii.apresentacao_insumo_id WHERE ii.inventario_id=$1 ORDER BY s.insumo,s.apresentacao',
        [id],
      )
    ).rows;
    return {
      ...h,
      iniciadoEm: (h.iniciado_em as Date).toISOString(),
      concluidoEm: h.concluido_em
        ? (h.concluido_em as Date).toISOString()
        : null,
      itens,
    };
  }
  async informarItemInventario(
    i: Parameters<EstoquePort["informarItemInventario"]>[0],
  ) {
    const r = await this.pool.query(
      `UPDATE pastoral.inventarios_itens ii SET saldo_fisico=$3 FROM pastoral.inventarios inv WHERE ii.inventario_id=$1 AND ii.apresentacao_insumo_id=$2 AND inv.id=ii.inventario_id AND inv.status='ABERTO'`,
      [i.inventarioId, i.apresentacaoId, i.saldoFisico],
    );
    if (!r.rowCount)
      throw new DomainError(
        "INVENTARIO_ITEM_NAO_ENCONTRADO",
        "Inventário aberto/item não encontrado",
      );
  }
  async concluirInventario(
    i: Parameters<EstoquePort["concluirInventario"]>[0],
  ) {
    await this.tx(async (c) => {
      await schema(c);
      try {
        await c.query("SELECT pastoral.concluir_inventario($1,$2)", [
          i.inventarioId,
          i.usuarioId,
        ]);
      } catch (e) {
        throw dbError(e, "INVENTARIO_INVALIDO");
      }
    });
  }
  async montar(i: Parameters<EstoquePort["montar"]>[0]) {
    return this.tx(async (c) => {
      await schema(c);
      try {
        const r = await c.query<{ id: string }>(
          "SELECT pastoral.montar_cestas($1,$2,$3)::text id",
          [i.planejamentoVersaoId, i.quantidade, i.usuarioId],
        );
        return { id: r.rows[0]?.id ?? "" };
      } catch (e) {
        throw dbError(e, "MONTAGEM_INVALIDA");
      }
    });
  }
  async listarLotes() {
    return (
      await this.pool.query(
        `${LOTES} GROUP BY l.id,pv.numero_versao,pc.id,u.id,u.login ORDER BY l.montado_em DESC,l.id DESC`,
      )
    ).rows.map(mapLote);
  }
  async obterLote(id: string) {
    const x = (
      await this.pool.query(
        `${LOTES} WHERE l.id=$1 GROUP BY l.id,pv.numero_versao,pc.id,u.id,u.login`,
        [id],
      )
    ).rows[0];
    return x ? mapLote(x) : null;
  }
  async desmontar(i: Parameters<EstoquePort["desmontar"]>[0]) {
    await this.tx(async (c) => {
      const l = (
        await c.query<{
          quantidade_disponivel: number;
          quantidade_montada: number;
          planejamento_versao_id: string;
        }>(
          "SELECT quantidade_disponivel,quantidade_montada,planejamento_versao_id::text FROM pastoral.lotes_montagem WHERE id=$1 FOR UPDATE",
          [i.loteId],
        )
      ).rows[0];
      if (!l)
        throw new DomainError("LOTE_NAO_ENCONTRADO", "Lote não encontrado");
      if (i.quantidade <= 0 || l.quantidade_disponivel < i.quantidade)
        throw new DomainError(
          "QUANTIDADE_CESTAS_INSUFICIENTE",
          "Quantidade indisponível",
        );
      const itens = (
        await c.query<{
          apresentacao_insumo_id: string;
          quantidade_por_cesta: number;
        }>(
          "SELECT apresentacao_insumo_id::text,quantidade_por_cesta FROM pastoral.lotes_montagem_itens WHERE lote_montagem_id=$1",
          [i.loteId],
        )
      ).rows;
      for (const x of itens) {
        const q = x.quantidade_por_cesta * i.quantidade;
        await c.query(
          "INSERT INTO pastoral.movimentacoes_insumos(apresentacao_insumo_id,tipo,quantidade,sentido,referencia_tipo,referencia_id,usuario_id,observacao) VALUES($1,'RETORNO_DESMONTAGEM',$2,1,'LOTE_MONTAGEM',$3,$4,$5)",
          [x.apresentacao_insumo_id, q, i.loteId, i.usuarioId, i.motivo],
        );
        await c.query(
          "UPDATE pastoral.reservas_insumos SET quantidade_consumida=GREATEST(0,quantidade_consumida-$3),atualizado_em=now() WHERE planejamento_versao_id=$1 AND apresentacao_insumo_id=$2",
          [l.planejamento_versao_id, x.apresentacao_insumo_id, q],
        );
      }
      await c.query(
        "INSERT INTO pastoral.movimentacoes_cestas(lote_montagem_id,tipo,quantidade,sentido,referencia_tipo,referencia_id,usuario_id,observacao) VALUES($1,'DESMONTAGEM',$2,-1,'LOTE_MONTAGEM',$1,$3,$4)",
        [i.loteId, i.quantidade, i.usuarioId, i.motivo],
      );
      await c.query(
        "UPDATE pastoral.lotes_montagem SET quantidade_montada=quantidade_montada-$2,quantidade_disponivel=quantidade_disponivel-$2,status=CASE WHEN quantidade_montada-$2=0 THEN 'DESMONTADO' ELSE 'ATIVO' END WHERE id=$1",
        [i.loteId, i.quantidade],
      );
    });
  }
  async ajustarLote(i: Parameters<EstoquePort["ajustarLote"]>[0]) {
    return this.tx(async (c) => {
      const l = (
        await c.query<{ quantidade_montada: number }>(
          "SELECT quantidade_montada FROM pastoral.lotes_montagem WHERE id=$1 FOR UPDATE",
          [i.loteId],
        )
      ).rows[0];
      if (!l)
        throw new DomainError("LOTE_NAO_ENCONTRADO", "Lote não encontrado");
      if (i.quantidadeCestasAfetadas > l.quantidade_montada)
        throw new DomainError(
          "QUANTIDADE_CESTAS_INSUFICIENTE",
          "Quantidade de cestas inválida",
        );
      const a = await c.query<{ id: string }>(
        "INSERT INTO pastoral.lotes_montagem_ajustes(lote_montagem_id,quantidade_cestas_afetadas,motivo,usuario_id) VALUES($1,$2,$3,$4) RETURNING id::text",
        [i.loteId, i.quantidadeCestasAfetadas, i.motivo, i.usuarioId],
      );
      const id = a.rows[0]?.id ?? "";
      for (const x of i.itens) {
        const total = x.quantidadePorCesta * i.quantidadeCestasAfetadas;
        if (x.operacao === "ADICIONAR") {
          await c.query(
            "SELECT id FROM pastoral.insumos_apresentacoes WHERE id=$1 FOR UPDATE",
            [x.apresentacaoInsumoId],
          );
          const s = (
            await c.query<{ saldo_disponivel: string }>(
              "SELECT saldo_disponivel::text FROM pastoral.vw_disponibilidade_insumos WHERE apresentacao_insumo_id=$1",
              [x.apresentacaoInsumoId],
            )
          ).rows[0];
          if (Number(s?.saldo_disponivel ?? 0) < total)
            throw new DomainError(
              "SALDO_INSUFICIENTE",
              "Saldo insuficiente para ajuste",
            );
        } else {
          const snap = (
            await c.query<{ quantidade_por_cesta: number }>(
              "SELECT quantidade_por_cesta FROM pastoral.lotes_montagem_itens WHERE lote_montagem_id=$1 AND apresentacao_insumo_id=$2",
              [i.loteId, x.apresentacaoInsumoId],
            )
          ).rows[0];
          if (!snap || snap.quantidade_por_cesta < x.quantidadePorCesta)
            throw new DomainError(
              "AJUSTE_INVALIDO",
              "Remoção excede composição",
            );
        }
        await c.query(
          "INSERT INTO pastoral.lotes_montagem_ajustes_itens(ajuste_id,apresentacao_insumo_id,operacao,quantidade_por_cesta) VALUES($1,$2,$3,$4)",
          [id, x.apresentacaoInsumoId, x.operacao, x.quantidadePorCesta],
        );
        await c.query(
          `INSERT INTO pastoral.movimentacoes_insumos(apresentacao_insumo_id,tipo,quantidade,sentido,referencia_tipo,referencia_id,usuario_id,observacao) VALUES($1,$2,$3,$4,'AJUSTE_LOTE',$5,$6,$7)`,
          [
            x.apresentacaoInsumoId,
            x.operacao === "ADICIONAR"
              ? "CONSUMO_MONTAGEM"
              : "RETORNO_DESMONTAGEM",
            total,
            x.operacao === "ADICIONAR" ? -1 : 1,
            id,
            i.usuarioId,
            i.motivo,
          ],
        );
      }
      return { id };
    });
  }
  async liberar(i: Parameters<EstoquePort["liberar"]>[0]) {
    return this.tx(async (c) => {
      const distribuicao = (
        await c.query<{ status: string }>(
          "SELECT status FROM pastoral.distribuicoes WHERE id=$1 FOR UPDATE",
          [i.distribuicaoId],
        )
      ).rows[0];
      if (!distribuicao)
        throw new DomainError(
          "DISTRIBUICAO_NAO_ENCONTRADA",
          "Distribuição não encontrada",
        );
      if (distribuicao.status === "ENCERRADA")
        throw new DomainError(
          "DISTRIBUICAO_ENCERRADA",
          "Distribuição encerrada",
        );
      await schema(c);
      try {
        const r = await c.query<{ id: string }>(
          "SELECT pastoral.liberar_cestas($1,$2,$3,$4)::text id",
          [i.distribuicaoId, i.loteMontagemId, i.quantidade, i.usuarioId],
        );
        return { id: r.rows[0]?.id ?? "" };
      } catch (e) {
        throw dbError(e, "LIBERACAO_INVALIDA");
      }
    });
  }
  async listarLiberacoes(id: string) {
    return (
      await this.pool.query(
        `SELECT l.id::text,l.lote_montagem_id::text "loteMontagemId",l.quantidade_liberada "quantidadeLiberada",l.quantidade_consumida "quantidadeConsumida",l.quantidade_retornada "quantidadeRetornada",l.quantidade_liberada-l.quantidade_consumida-l.quantidade_retornada "quantidadeDisponivel",l.usuario_estoque_id::text "usuarioId",l.liberado_em "liberadoEm" FROM pastoral.distribuicoes_liberacoes_cestas l WHERE l.distribuicao_id=$1 ORDER BY l.liberado_em,l.id`,
        [id],
      )
    ).rows.map((x) => ({
      ...x,
      liberadoEm: (x.liberadoEm as Date).toISOString(),
    }));
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
const INSUMOS = `SELECT ai.id::text apresentacao_id,i.id::text insumo_id,i.nome,ai.descricao,c.id::text categoria_id,c.codigo categoria,d.saldo_fisico::text,d.saldo_reservado::text,d.saldo_disponivel::text,ai.quantidade_referencia::text,ai.unidade_medida FROM pastoral.insumos_apresentacoes ai JOIN pastoral.insumos i ON i.id=ai.insumo_id LEFT JOIN pastoral.categorias_prioridade_insumo c ON c.id=i.categoria_prioridade_id JOIN pastoral.vw_disponibilidade_insumos d ON d.apresentacao_insumo_id=ai.id`;
interface InsumoRow {
  apresentacao_id: string;
  insumo_id: string;
  nome: string;
  descricao: string;
  categoria_id: string | null;
  categoria: string | null;
  quantidade_referencia: string | null;
  unidade_medida: string | null;
  saldo_fisico: string;
  saldo_reservado: string;
  saldo_disponivel: string;
}
function mapInsumo(x: InsumoRow) {
  return {
    apresentacaoId: x.apresentacao_id,
    insumoId: x.insumo_id,
    insumo: x.nome,
    apresentacao: x.descricao,
    categoria: x.categoria_id
      ? { id: x.categoria_id, codigo: x.categoria }
      : null,
    quantidadeReferencia: x.quantidade_referencia
      ? Number(x.quantidade_referencia)
      : null,
    unidadeMedida: x.unidade_medida,
    saldoFisico: Number(x.saldo_fisico),
    saldoReservado: Number(x.saldo_reservado),
    saldoDisponivel: Number(x.saldo_disponivel),
  };
}
const LOTES = `SELECT l.id::text,l.quantidade_montada,l.quantidade_disponivel,l.status,l.montado_em,pv.id::text planejamento_versao_id,pv.numero_versao,pc.id::text planejamento_id,u.id::text usuario_id,u.login,COALESCE(json_agg(json_build_object('apresentacaoInsumoId',li.apresentacao_insumo_id::text,'quantidadePorCesta',li.quantidade_por_cesta)) FILTER(WHERE li.id IS NOT NULL),'[]') itens FROM pastoral.lotes_montagem l JOIN pastoral.planejamentos_cesta_versoes pv ON pv.id=l.planejamento_versao_id JOIN pastoral.planejamentos_cesta pc ON pc.id=pv.planejamento_cesta_id JOIN pastoral.usuarios u ON u.id=l.usuario_id LEFT JOIN pastoral.lotes_montagem_itens li ON li.lote_montagem_id=l.id`;
interface LoteRow {
  id: string;
  quantidade_montada: number;
  quantidade_disponivel: number;
  status: string;
  montado_em: Date;
  planejamento_id: string;
  planejamento_versao_id: string;
  numero_versao: number;
  usuario_id: string;
  login: string;
  itens: unknown[];
}
function mapLote(x: LoteRow) {
  return {
    id: x.id,
    quantidadeMontada: x.quantidade_montada,
    quantidadeDisponivel: x.quantidade_disponivel,
    status: x.status,
    montadoEm: (x.montado_em as Date).toISOString(),
    planejamento: {
      id: x.planejamento_id,
      versaoId: x.planejamento_versao_id,
      numeroVersao: x.numero_versao,
    },
    responsavel: { id: x.usuario_id, login: x.login },
    itens: x.itens,
  };
}
async function schema(c: PoolClient) {
  await c.query("SET LOCAL search_path TO pastoral,public");
}
function dbError(e: unknown, code: string) {
  const m = e instanceof Error ? e.message : "Operação inválida";
  return new DomainError(
    m.includes("insuficiente") ? "SALDO_INSUFICIENTE" : code,
    m,
  );
}
