import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import request from "supertest";
import { createApp } from "../../src/main/app.js";
import { dependencies } from "../../src/main/dependencies.js";
import { race, reset, sqlTransaction, testPool } from "./helpers.js";

const db = testPool();
const app = createApp();
let token: string;
const stockLock = "SELECT pastoral.bloquear_estoque()";
const distributionLock =
  "SELECT id FROM pastoral.distribuicoes WHERE id=1 FOR UPDATE";
const headers = () => ({ Authorization: `Bearer ${token}` });
const post = (path: string, body: object = {}) =>
  request(app).post(`/api/v1${path}`).set(headers()).send(body);
const get = (path: string) => request(app).get(`/api/v1${path}`).set(headers());
async function scalar(sql: string) {
  return Number((await db.query(sql)).rows[0]?.value);
}
async function state(sql: string) {
  return (await db.query(sql)).rows[0];
}
const physical = () =>
  scalar(
    "SELECT saldo_fisico value FROM pastoral.vw_saldo_insumos WHERE apresentacao_insumo_id=1",
  );

const adjustLot = (
  operacao: "REMOVER" | "ADICIONAR",
  quantidadeCestasAfetadas = 4,
  quantidadePorCesta = 1,
  apresentacaoInsumoId = "1",
) =>
  post("/estoque/lotes-montagem/1/ajustes", {
    quantidadeCestasAfetadas,
    motivo: "Regressão composição",
    itens: [{ apresentacaoInsumoId, operacao, quantidadePorCesta }],
  });
const dismantleLot = (quantidade = 4) =>
  post("/estoque/lotes-montagem/1/desmontar", {
    quantidade,
    motivo: "Regressão composição",
  });
async function assembleLot() {
  await post("/planejamentos/1/aprovar").expect(204);
  await post("/estoque/lotes-montagem", {
    planejamentoVersaoId: "1",
    quantidade: 4,
  }).expect(201);
}
async function lotTotal() {
  const result = await get("/estoque/lotes-montagem/1").expect(200);
  return result.body.data.itens.reduce(
    (sum: number, item: { quantidadeTotal: number }) =>
      sum + item.quantidadeTotal,
    0,
  ) as number;
}
async function lotMovements() {
  return scalar(
    "SELECT count(*) value FROM pastoral.movimentacoes_insumos WHERE referencia_tipo IN ('LOTE_MONTAGEM','AJUSTE_LOTE')",
  );
}

describe("Composição efetiva do lote: regressões PostgreSQL HTTP", () => {
  it("lote nunca ajustado permite desmontagem parcial e integral do restante", async () => {
    await assembleLot();
    const detail = await get("/estoque/lotes-montagem/1").expect(200);
    expect(detail.body.data).toMatchObject({
      possuiAjustes: false,
      permiteDesmontagemParcial: true,
      podeAjustar: true,
      podeDesmontar: true,
    });
    await dismantleLot(1).expect(204);
    expect(await physical()).toBe(7);
    expect(await lotTotal()).toBe(3);
    expect(await lotMovements()).toBe(2);
    expect(
      await state(
        "SELECT status,quantidade_montada,quantidade_disponivel FROM pastoral.lotes_montagem WHERE id=1",
      ),
    ).toEqual({
      status: "ATIVO",
      quantidade_montada: 3,
      quantidade_disponivel: 3,
    });
    await dismantleLot(3).expect(204);
    expect(await physical()).toBe(10);
    expect(await lotTotal()).toBe(0);
    expect(await lotMovements()).toBe(3);
    expect(
      await state("SELECT status FROM pastoral.lotes_montagem WHERE id=1"),
    ).toEqual({ status: "DESMONTADO" });
  });
  it.each([1, 4])(
    "qualquer ajuste (%i cestas) bloqueia parcial com código estável e não altera estoque",
    async (quantidade) => {
      await assembleLot();
      await adjustLot("REMOVER", quantidade).expect(201);
      const before = await lotMovements();
      const result = await dismantleLot(1).expect(409);
      expect(result.body.error.code).toBe("LOTE_AJUSTADO_DESMONTAGEM_PARCIAL");
      expect(result.body.error.message).toBe(
        "Este lote possui ajustes e só pode ser desmontado integralmente.",
      );
      expect(await physical()).toBe(6 + quantidade);
      expect(await lotTotal()).toBe(4 - quantidade);
      expect(await lotMovements()).toBe(before);
      expect(
        await scalar(
          "SELECT count(*) value FROM pastoral.movimentacoes_cestas WHERE tipo='DESMONTAGEM'",
        ),
      ).toBe(0);
      const detail = await get("/estoque/lotes-montagem/1").expect(200);
      expect(detail.body.data).toMatchObject({
        status: "ATIVO",
        quantidadeMontada: 4,
        possuiAjustes: true,
        permiteDesmontagemParcial: false,
        podeDesmontar: true,
      });
      await dismantleLot().expect(204);
      expect(await physical()).toBe(10);
      expect(await lotTotal()).toBe(0);
    },
  );
  it("parcial anterior ao ajuste é descontada do conteúdo devolvido na integral", async () => {
    await assembleLot();
    await dismantleLot(1).expect(204);
    await adjustLot("REMOVER", 1).expect(201);
    expect(await lotTotal()).toBe(2);
    expect(await physical()).toBe(8);
    await dismantleLot(3).expect(204);
    expect(await lotTotal()).toBe(0);
    expect(await physical()).toBe(10);
    expect(await lotMovements()).toBe(4);
    expect(
      await scalar(
        "SELECT sum(quantidade) value FROM pastoral.movimentacoes_insumos WHERE referencia_tipo='LOTE_MONTAGEM' AND tipo='RETORNO_DESMONTAGEM'",
      ),
    ).toBe(3);
  });
  it("ajuste não pode movimentar conteúdo de cestas já indisponíveis no lote", async () => {
    await assembleLot();
    await post("/distribuicoes/1/liberacoes-cestas", {
      loteMontagemId: "1",
      quantidade: 1,
    }).expect(201);
    const result = await adjustLot("REMOVER", 1).expect(409);
    expect(result.body.error.code).toBe("LOTE_AJUSTE_CESTAS_INDISPONIVEIS");
    expect(await physical()).toBe(6);
    expect(await lotTotal()).toBe(4);
    expect(await lotMovements()).toBe(1);
    expect(
      await scalar(
        "SELECT count(*) value FROM pastoral.lotes_montagem_ajustes",
      ),
    ).toBe(0);
    const detail = await get("/estoque/lotes-montagem/1").expect(200);
    expect(detail.body.data).toMatchObject({
      podeAjustar: false,
      podeDesmontar: true,
      permiteDesmontagemParcial: true,
      quantidadeDisponivel: 3,
    });
    await dismantleLot(1).expect(204);
    expect(await physical()).toBe(7);
    expect(await lotTotal()).toBe(3);
    await dismantleLot(2).expect(204);
    expect(await physical()).toBe(9);
    expect(await lotTotal()).toBe(1);
    expect(await lotMovements()).toBe(3);
    expect(
      await state(
        "SELECT status,quantidade_montada,quantidade_disponivel FROM pastoral.lotes_montagem WHERE id=1",
      ),
    ).toEqual({
      status: "ESGOTADO",
      quantidade_montada: 1,
      quantidade_disponivel: 0,
    });
  });
  it("lote ajustado com cestas indisponíveis não permite desmontagem integral nem parcial", async () => {
    await assembleLot();
    await adjustLot("ADICIONAR", 1).expect(201);
    await post("/distribuicoes/1/liberacoes-cestas", {
      loteMontagemId: "1",
      quantidade: 1,
    }).expect(201);
    await dismantleLot(3).expect(409);
    await dismantleLot().expect(409);
    expect(await physical()).toBe(5);
    expect(await lotTotal()).toBe(5);
    expect(await lotMovements()).toBe(2);
    const detail = await get("/estoque/lotes-montagem/1").expect(200);
    expect(detail.body.data).toMatchObject({
      podeAjustar: false,
      podeDesmontar: false,
      permiteDesmontagemParcial: false,
      quantidadeDisponivel: 3,
      status: "ATIVO",
    });
  });
  it("migration reaplicada preserva histórico, total e saldo", async () => {
    await assembleLot();
    await adjustLot("REMOVER", 1).expect(201);
    const migration = await readFile(
      new URL(
        "../../database/migrations/20260906_001_current_lot_composition.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.query(migration);
    await db.query(migration);
    expect(await lotTotal()).toBe(3);
    expect(await physical()).toBe(7);
    expect(await lotMovements()).toBe(2);
    expect(
      await scalar(
        "SELECT quantidade_por_cesta value FROM pastoral.lotes_montagem_itens WHERE lote_montagem_id=1",
      ),
    ).toBe(1);
    await dismantleLot().expect(204);
    expect(await physical()).toBe(10);
    expect(await lotTotal()).toBe(0);
  });
  it("montagem expõe a composição efetiva inicial", async () => {
    await assembleLot();
    expect(await lotTotal()).toBe(4);
    expect(await physical()).toBe(6);
  });
  it("remoção parcial credita apenas as unidades removidas e desmontagem devolve o restante", async () => {
    await assembleLot();
    await adjustLot("REMOVER", 1).expect(201);
    expect(await lotTotal()).toBe(3);
    expect(await physical()).toBe(7);
    await dismantleLot().expect(204);
    expect(await physical()).toBe(10);
    expect(await lotTotal()).toBe(0);
    expect(await lotMovements()).toBe(3);
    expect(
      await state(
        "SELECT status,quantidade_montada,quantidade_disponivel FROM pastoral.lotes_montagem WHERE id=1",
      ),
    ).toEqual({
      status: "DESMONTADO",
      quantidade_montada: 0,
      quantidade_disponivel: 0,
    });
    expect(
      await scalar(
        "SELECT quantidade value FROM pastoral.movimentacoes_insumos WHERE referencia_tipo='LOTE_MONTAGEM' AND tipo='RETORNO_DESMONTAGEM'",
      ),
    ).toBe(3);
  });
  it("adição passa a integrar o lote e é devolvida exatamente uma vez", async () => {
    await assembleLot();
    await adjustLot("ADICIONAR", 2).expect(201);
    expect(await lotTotal()).toBe(6);
    expect(await physical()).toBe(4);
    await dismantleLot().expect(204);
    expect(await physical()).toBe(10);
    expect(await lotMovements()).toBe(3);
  });
  it("remoção, adição e remoção sucessivas usam o saldo atual", async () => {
    await assembleLot();
    await adjustLot("REMOVER", 2).expect(201);
    await adjustLot("ADICIONAR", 1).expect(201);
    await adjustLot("REMOVER", 1).expect(201);
    expect(await lotTotal()).toBe(2);
    expect(await physical()).toBe(8);
    await dismantleLot().expect(204);
    expect(await physical()).toBe(10);
    expect(await lotMovements()).toBe(5);
  });
  it("adição de apresentação ausente do snapshot aparece no detalhe e retorna na desmontagem", async () => {
    await assembleLot();
    await db.query(
      "INSERT INTO pastoral.insumos(nome) VALUES('Feijão sintético'); INSERT INTO pastoral.insumos_apresentacoes(insumo_id,descricao) VALUES(2,'Pacote')",
    );
    await post("/estoque/entradas", {
      tipo: "DOACAO",
      itens: [{ apresentacaoInsumoId: "2", quantidade: 5 }],
    }).expect(201);
    await adjustLot("ADICIONAR", 2, 1, "2").expect(201);
    const detail = await get("/estoque/lotes-montagem/1").expect(200);
    expect(detail.body.data.itens).toContainEqual({
      apresentacaoInsumoId: "2",
      quantidadePorCesta: 0.5,
      quantidadeTotal: 2,
    });
    expect(
      await scalar(
        "SELECT saldo_fisico value FROM pastoral.vw_saldo_insumos WHERE apresentacao_insumo_id=2",
      ),
    ).toBe(3);
    await dismantleLot().expect(204);
    expect(
      await scalar(
        "SELECT saldo_fisico value FROM pastoral.vw_saldo_insumos WHERE apresentacao_insumo_id=2",
      ),
    ).toBe(5);
    expect(await physical()).toBe(10);
    expect(
      await scalar(
        "SELECT count(*) value FROM pastoral.lotes_montagem_itens WHERE apresentacao_insumo_id=2",
      ),
    ).toBe(0);
  });
  it("falha no segundo item reverte o primeiro movimento e todo o histórico", async () => {
    await assembleLot();
    await post("/estoque/lotes-montagem/1/ajustes", {
      quantidadeCestasAfetadas: 3,
      motivo: "Rollback",
      itens: [
        {
          apresentacaoInsumoId: "1",
          operacao: "REMOVER",
          quantidadePorCesta: 1,
        },
        {
          apresentacaoInsumoId: "1",
          operacao: "REMOVER",
          quantidadePorCesta: 1,
        },
      ],
    }).expect(409);
    expect(await physical()).toBe(6);
    expect(await lotTotal()).toBe(4);
    expect(await lotMovements()).toBe(1);
    expect(
      await scalar(
        "SELECT count(*) value FROM pastoral.lotes_montagem_ajustes",
      ),
    ).toBe(0);
    expect(
      await scalar(
        "SELECT count(*) value FROM pastoral.lotes_montagem_ajustes_itens",
      ),
    ).toBe(0);
  });
  it("adição sem saldo não altera composição, movimentos ou auditoria", async () => {
    await assembleLot();
    await adjustLot("ADICIONAR", 4, 2).expect(409);
    expect(await lotTotal()).toBe(4);
    expect(await physical()).toBe(6);
    expect(await lotMovements()).toBe(1);
    expect(
      await scalar(
        "SELECT count(*) value FROM pastoral.lotes_montagem_ajustes",
      ),
    ).toBe(0);
  });
  it("remoção completa não gera movimento zero na desmontagem; repetição e ajuste são conflitos", async () => {
    await assembleLot();
    await adjustLot("REMOVER").expect(201);
    expect(await lotTotal()).toBe(0);
    await dismantleLot().expect(204);
    await dismantleLot().expect(409);
    await adjustLot("ADICIONAR").expect(409);
    expect(await physical()).toBe(10);
    expect(await lotMovements()).toBe(2);
    expect(
      await scalar(
        "SELECT count(*) value FROM pastoral.movimentacoes_cestas WHERE tipo='DESMONTAGEM'",
      ),
    ).toBe(1);
  });
  it("remoção acima do total e quantidade zero não escrevem histórico ou estoque", async () => {
    await assembleLot();
    await adjustLot("REMOVER", 3).expect(201);
    const before = await lotMovements();
    await adjustLot("REMOVER", 2).expect(409);
    expect((await adjustLot("REMOVER", 0)).status).toBeGreaterThanOrEqual(400);
    expect(await lotTotal()).toBe(1);
    expect(await physical()).toBe(9);
    expect(await lotMovements()).toBe(before);
    expect(
      await scalar(
        "SELECT count(*) value FROM pastoral.lotes_montagem_ajustes",
      ),
    ).toBe(1);
  });
  it("remoções concorrentes excedentes: 201 + 409, sem composição negativa ou crédito duplicado", async () => {
    await assembleLot();
    const op = () => adjustLot("REMOVER", 3).then((r) => r.status);
    const result = await race(db, stockLock, [op, op]);
    expect(
      result.map((r) => (r.status === "fulfilled" ? r.value : r.reason)).sort(),
    ).toEqual([201, 409]);
    expect(await lotTotal()).toBe(1);
    expect(await physical()).toBe(9);
    expect(await lotMovements()).toBe(2);
    expect(
      await state("SELECT status FROM pastoral.lotes_montagem WHERE id=1"),
    ).toEqual({ status: "ATIVO" });
  });
  it("ajuste concorrente com desmontagem serializa a devolução física", async () => {
    await assembleLot();
    const result = await race(db, stockLock, [
      () => adjustLot("REMOVER", 1).then((r) => r.status),
      () => dismantleLot().then((r) => r.status),
    ]);
    expect(result[1]).toMatchObject({ status: "fulfilled", value: 204 });
    expect(result[0]?.status).toBe("fulfilled");
    const adjustment = result[0]?.status === "fulfilled" ? result[0].value : 0;
    expect([201, 409]).toContain(adjustment);
    expect(await physical()).toBe(10);
    expect(await lotTotal()).toBe(0);
    expect(await lotMovements()).toBe(adjustment === 201 ? 3 : 2);
    expect(
      await state("SELECT status FROM pastoral.lotes_montagem WHERE id=1"),
    ).toEqual({ status: "DESMONTADO" });
  });
});

beforeEach(async () => {
  await reset(db);
  await db.query(`
    INSERT INTO pastoral.usuarios(login,senha_hash) VALUES('integration','not-a-login-credential');
    INSERT INTO pastoral.perfis(codigo,nome) VALUES('TESTE','Integração');
    INSERT INTO pastoral.permissoes(codigo,descricao)
    SELECT p,p FROM unnest(ARRAY['ESTOQUE_VISUALIZAR','ESTOQUE_ENTRADA','ESTOQUE_PERDA','ESTOQUE_INVENTARIO',
      'CESTA_MONTAR','CESTA_AJUSTAR_LOTE','CESTA_DESMONTAR','CESTA_LIBERAR_DISTRIBUICAO','CESTA_PLANEJAMENTO_APROVAR','DISTRIBUICAO_ABRIR',
      'DISTRIBUICAO_ENCERRAR','DISTRIBUICAO_TRIAGEM','RETIRADA_REGISTRAR','RETIRADA_ESTORNAR_QUALQUER',
      'CESTA_ADICIONAL_AUTORIZAR','BENEFICIARIO_VISUALIZAR']) p;
    INSERT INTO pastoral.perfis_permissoes SELECT 1,id FROM pastoral.permissoes;
    INSERT INTO pastoral.usuarios_perfis VALUES(1,1);
    INSERT INTO pastoral.grupos_distribuicao(codigo,nome,regra_calendario,ordem) VALUES('A','Grupo A','SEGUNDO_SABADO',1);
    INSERT INTO pastoral.pessoas(nome_completo) VALUES('Pessoa sintética');
    INSERT INTO pastoral.beneficiarios(pessoa_id,grupo_distribuicao_id) VALUES(1,1);
    INSERT INTO pastoral.competencias(ano,mes) VALUES(2035,1);
    INSERT INTO pastoral.distribuicoes(competencia_id,grupo_distribuicao_id,data_prevista) VALUES(1,1,'2035-01-13');
    INSERT INTO pastoral.direitos_beneficio(beneficiario_id,competencia_id,distribuicao_prevista_id) VALUES(1,1,1);
    INSERT INTO pastoral.insumos(nome) VALUES('Arroz sintético');
    INSERT INTO pastoral.insumos_apresentacoes(insumo_id,descricao) VALUES(1,'Pacote');
    INSERT INTO pastoral.motivos_perda_estoque(codigo,descricao) VALUES('TESTE','Perda sintética');
    INSERT INTO pastoral.modelos_cesta(nome,tipo) VALUES('Regular teste','REGULAR');
    INSERT INTO pastoral.modelos_cesta_versoes(modelo_cesta_id,numero_versao,meta_itens,usuario_id) VALUES(1,1,1,1);
    INSERT INTO pastoral.modelos_cesta_versoes_itens(modelo_cesta_versao_id,apresentacao_insumo_id,quantidade) VALUES(1,1,1);
    INSERT INTO pastoral.planejamentos_cesta(competencia_id,modelo_cesta_id) VALUES(1,1);
    INSERT INTO pastoral.planejamentos_cesta_versoes(planejamento_cesta_id,numero_versao,quantidade_planejada) VALUES(1,1,4);
    INSERT INTO pastoral.planejamentos_cesta_versoes_itens(planejamento_versao_id,apresentacao_insumo_id,quantidade_por_cesta) VALUES(1,1,1);
  `);
  token = await dependencies.tokenService.sign({ subject: "1" });
  await post("/estoque/entradas", {
    tipo: "DOACAO",
    itens: [{ apresentacaoInsumoId: "1", quantidade: 10 }],
  }).expect(201);
});

afterAll(async () => {
  await dependencies.postgresPool.end();
  await db.end();
});

async function prepare() {
  await post("/planejamentos/1/aprovar").expect(204);
  await post("/estoque/lotes-montagem", {
    planejamentoVersaoId: "1",
    quantidade: 4,
  }).expect(201);
  await post("/distribuicoes/1/liberacoes-cestas", {
    loteMontagemId: "1",
    quantidade: 4,
  }).expect(201);
  await post("/distribuicoes/1/abrir").expect(204);
  await post("/distribuicoes/1/check-ins", { beneficiarioId: "1" }).expect(201);
}
const withdraw = () =>
  post("/distribuicoes/1/retiradas", {
    beneficiarioId: "1",
    tipo: "TITULAR",
    formaIdentificacao: "DOCUMENTO",
  });
const reverse = () =>
  post("/retiradas/1/estornar", { motivo: "Correção sintética" });
const loss = (quantidade: number) =>
  post("/estoque/perdas", {
    apresentacaoInsumoId: "1",
    quantidade,
    motivoId: "1",
  });
const authorize = (modeloCestaId = "1", quantidade = 1) =>
  post("/distribuicoes/1/cestas-adicionais", {
    beneficiarioId: "1",
    modeloCestaId,
    quantidade,
    justificativa: "Teste isolado",
  });
async function secondPlan(quantity = 4) {
  await db.query(`
    INSERT INTO pastoral.modelos_cesta(nome,tipo) VALUES('Especial teste','ESPECIAL');
    INSERT INTO pastoral.planejamentos_cesta(competencia_id,modelo_cesta_id) VALUES(1,2);
  `);
  await db.query(
    "INSERT INTO pastoral.planejamentos_cesta_versoes(planejamento_cesta_id,numero_versao,quantidade_planejada) VALUES(2,1,$1)",
    [quantity],
  );
  await db.query(
    "INSERT INTO pastoral.planejamentos_cesta_versoes_itens(planejamento_versao_id,apresentacao_insumo_id,quantidade_por_cesta) VALUES(2,1,1)",
  );
}

describe("PostgreSQL real: lotes e ciclo físico HTTP", () => {
  it("lista e detalha lote com planejamento e composição, sem 42803", async () => {
    await prepare();
    const list = await get("/estoque/lotes-montagem").expect(200);
    const detail = await get("/estoque/lotes-montagem/1").expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(detail.body.data).toMatchObject({
      id: "1",
      planejamento: { id: "1", versaoId: "1", numeroVersao: 1 },
      itens: [{ apresentacaoInsumoId: "1", quantidadePorCesta: 1 }],
    });
    expect(list.body.data[0]).toEqual(detail.body.data);
  });
  it("aprova/reserva sem baixa, monta com baixa e libera sem entregar", async () => {
    await post("/planejamentos/1/aprovar").expect(204);
    expect(await physical()).toBe(10);
    expect(
      await scalar(
        "SELECT quantidade_reservada value FROM pastoral.reservas_insumos",
      ),
    ).toBe(4);
    await post("/estoque/lotes-montagem", {
      planejamentoVersaoId: "1",
      quantidade: 4,
    }).expect(201);
    expect(await physical()).toBe(6);
    expect(
      await scalar(
        "SELECT quantidade_consumida value FROM pastoral.reservas_insumos",
      ),
    ).toBe(4);
    await post("/distribuicoes/1/liberacoes-cestas", {
      loteMontagemId: "1",
      quantidade: 4,
    }).expect(201);
    expect(
      await scalar(
        "SELECT quantidade_disponivel value FROM pastoral.lotes_montagem",
      ),
    ).toBe(0);
    expect(
      await scalar("SELECT count(*) value FROM pastoral.entregas_cestas"),
    ).toBe(0);
    expect(
      await scalar(
        "SELECT quantidade_consumida value FROM pastoral.distribuicoes_liberacoes_cestas",
      ),
    ).toBe(0);
  });
  it("retirada baixa exatamente uma cesta e consome o direito", async () => {
    await prepare();
    await withdraw().expect(201);
    expect(
      await state("SELECT status FROM pastoral.direitos_beneficio WHERE id=1"),
    ).toEqual({ status: "RETIRADO" });
    expect(
      await scalar(
        "SELECT sum(quantidade) value FROM pastoral.entregas_cestas_lotes",
      ),
    ).toBe(1);
    expect(
      await scalar(
        "SELECT quantidade_consumida value FROM pastoral.distribuicoes_liberacoes_cestas",
      ),
    ).toBe(1);
    expect(
      await scalar(
        "SELECT sum(quantidade*sentido) value FROM pastoral.movimentacoes_cestas",
      ),
    ).toBe(3);
    expect(await physical()).toBe(6);
  });
  it("duas requisições concorrentes: 201 + 409, uma retirada e uma baixa", async () => {
    await prepare();
    const results = await race(db, distributionLock, [
      () => withdraw().then((r) => r.status),
      () => withdraw().then((r) => r.status),
    ]);
    expect(
      results
        .map((r) => (r.status === "fulfilled" ? r.value : r.reason))
        .sort(),
    ).toEqual([201, 409]);
    expect(
      await scalar(
        "SELECT count(*) value FROM pastoral.retiradas WHERE status='VALIDA'",
      ),
    ).toBe(1);
    expect(
      await scalar("SELECT count(*) value FROM pastoral.entregas_cestas"),
    ).toBe(1);
    expect(
      await scalar(
        "SELECT quantidade_consumida value FROM pastoral.distribuicoes_liberacoes_cestas",
      ),
    ).toBe(1);
  });
  it("falta de cesta faz rollback de retirada, entrega e direito", async () => {
    await post("/distribuicoes/1/abrir").expect(204);
    await post("/distribuicoes/1/check-ins", { beneficiarioId: "1" }).expect(
      201,
    );
    const r = await withdraw().expect(409);
    expect(r.body.error.code).toBe("SEM_CESTA_DISPONIVEL");
    expect(await scalar("SELECT count(*) value FROM pastoral.retiradas")).toBe(
      0,
    );
    expect(
      await scalar("SELECT count(*) value FROM pastoral.entregas_cestas"),
    ).toBe(0);
    expect(
      await state("SELECT status FROM pastoral.direitos_beneficio WHERE id=1"),
    ).toEqual({ status: "DISPONIVEL" });
  });
  it("estorno aberto preserva histórico e permite nova retirada", async () => {
    await prepare();
    await withdraw().expect(201);
    await reverse().expect(204);
    expect(
      await state("SELECT status FROM pastoral.retiradas WHERE id=1"),
    ).toEqual({ status: "ESTORNADA" });
    expect(
      await scalar("SELECT count(*) value FROM pastoral.retiradas_estornos"),
    ).toBe(1);
    expect(
      await scalar(
        "SELECT quantidade_consumida value FROM pastoral.distribuicoes_liberacoes_cestas",
      ),
    ).toBe(0);
    await withdraw().expect(201);
    expect(
      await scalar(
        "SELECT count(*) value FROM pastoral.retiradas WHERE status='VALIDA'",
      ),
    ).toBe(1);
  });
  it("encerramento retorna remanescentes e classifica presença/ausência", async () => {
    await prepare();
    await db.query(`INSERT INTO pastoral.pessoas(nome_completo) VALUES('Ausente sintético');
      INSERT INTO pastoral.beneficiarios(pessoa_id,grupo_distribuicao_id) VALUES(2,1);
      INSERT INTO pastoral.direitos_beneficio(beneficiario_id,competencia_id,distribuicao_prevista_id) VALUES(2,1,1)`);
    await post("/distribuicoes/1/encerrar").expect(204);
    expect(
      await state("SELECT status FROM pastoral.direitos_beneficio WHERE id=1"),
    ).toEqual({ status: "NAO_ATENDIDO_ESTOQUE" });
    expect(
      await state("SELECT status FROM pastoral.direitos_beneficio WHERE id=2"),
    ).toEqual({ status: "AUSENTE" });
    expect(await scalar("SELECT count(*) value FROM pastoral.ausencias")).toBe(
      1,
    );
    expect(
      await scalar(
        "SELECT quantidade_disponivel value FROM pastoral.lotes_montagem",
      ),
    ).toBe(4);
    await post("/distribuicoes/1/encerrar").expect(409);
    await withdraw().expect(409);
  });
  it("retirada → encerramento → estorno retorna cesta ao lote sem reabrir distribuição", async () => {
    await prepare();
    await withdraw().expect(201);
    await post("/distribuicoes/1/encerrar").expect(204);
    expect(
      await scalar(
        "SELECT quantidade_disponivel value FROM pastoral.lotes_montagem",
      ),
    ).toBe(3);
    await reverse().expect(204);
    expect(
      await state("SELECT status FROM pastoral.distribuicoes WHERE id=1"),
    ).toEqual({ status: "ENCERRADA" });
    expect(
      await state("SELECT status FROM pastoral.direitos_beneficio WHERE id=1"),
    ).toEqual({ status: "DISPONIVEL" });
    expect(
      await state(
        "SELECT quantidade_consumida,quantidade_retornada FROM pastoral.distribuicoes_liberacoes_cestas WHERE id=1",
      ),
    ).toEqual({ quantidade_consumida: 0, quantidade_retornada: 4 });
    expect(
      await scalar(
        "SELECT quantidade_disponivel value FROM pastoral.lotes_montagem",
      ),
    ).toBe(4);
    expect(
      await scalar(
        "SELECT sum(quantidade*sentido) value FROM pastoral.movimentacoes_cestas",
      ),
    ).toBe(4);
    await withdraw().expect(409);
    await reverse().expect(409);
  });
  it("estorno e encerramento concorrentes convergem sem dupla devolução", async () => {
    await prepare();
    await withdraw().expect(201);
    const results = await race(db, distributionLock, [
      () => reverse().then((r) => r.status),
      () => post("/distribuicoes/1/encerrar").then((r) => r.status),
    ]);
    expect(results).toEqual([
      { status: "fulfilled", value: 204 },
      { status: "fulfilled", value: 204 },
    ]);
    expect(
      await scalar(
        "SELECT quantidade_disponivel value FROM pastoral.lotes_montagem",
      ),
    ).toBe(4);
    expect(
      await scalar(
        "SELECT quantidade_retornada value FROM pastoral.distribuicoes_liberacoes_cestas",
      ),
    ).toBe(4);
    // A classificação assistencial depende da ordem existente; não é redefinida por esta correção física.
    expect(["DISPONIVEL", "NAO_ATENDIDO_ESTOQUE"]).toContain(
      (await state("SELECT status FROM pastoral.direitos_beneficio WHERE id=1"))
        ?.status,
    );
  });
});

describe("cesta adicional com estoque real", () => {
  it("consome apenas modelo autorizado, mesmo se outro modelo foi liberado primeiro", async () => {
    await prepare();
    await secondPlan(2);
    await post("/planejamentos/2/aprovar").expect(204);
    await post("/estoque/lotes-montagem", {
      planejamentoVersaoId: "2",
      quantidade: 2,
    }).expect(201);
    await post("/distribuicoes/1/liberacoes-cestas", {
      loteMontagemId: "2",
      quantidade: 2,
    }).expect(201);
    await authorize("2").expect(201);
    await post("/cestas-adicionais/1/entregar").expect(200);
    expect(
      await scalar(
        "SELECT quantidade_consumida value FROM pastoral.distribuicoes_liberacoes_cestas WHERE lote_montagem_id=1",
      ),
    ).toBe(0);
    expect(
      await scalar(
        "SELECT quantidade_consumida value FROM pastoral.distribuicoes_liberacoes_cestas WHERE lote_montagem_id=2",
      ),
    ).toBe(1);
  });
  it("saldo de outro modelo não cobre falta do modelo autorizado; rollback integral", async () => {
    await prepare();
    await secondPlan();
    await authorize("2").expect(201);
    await post("/cestas-adicionais/1/entregar").expect(409);
    expect(
      await state("SELECT status FROM pastoral.cestas_adicionais WHERE id=1"),
    ).toEqual({ status: "AUTORIZADA" });
    expect(
      await scalar("SELECT count(*) value FROM pastoral.entregas_cestas"),
    ).toBe(0);
    expect(
      await scalar(
        "SELECT quantidade_consumida value FROM pastoral.distribuicoes_liberacoes_cestas WHERE id=1",
      ),
    ).toBe(0);
  });
  it("não autoriza em distribuição encerrada", async () => {
    await prepare();
    await post("/distribuicoes/1/encerrar").expect(204);
    const r = await authorize().expect(409);
    expect(r.body.error.code).toBe("DISTRIBUICAO_ENCERRADA");
    expect(
      await scalar("SELECT count(*) value FROM pastoral.cestas_adicionais"),
    ).toBe(0);
  });
  it("autorização aguarda encerramento em outra conexão e é rejeitada", async () => {
    await prepare();
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pastoral.encerrar_distribuicao(1,1)");
      const pending = authorize().then((r) => r);
      // A consulta em conexão independente encontra a autorização esperando o lock.
      for (let i = 0; i < 100; i++) {
        if (
          (await scalar(
            "SELECT count(*) value FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'",
          )) > 0
        )
          break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(
        await scalar(
          "SELECT count(*) value FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'",
        ),
      ).toBeGreaterThan(0);
      await c.query("COMMIT");
      expect((await pending).status).toBe(409);
    } finally {
      await c.query("ROLLBACK");
      c.release();
    }
  });
  it("entrega adicional e encerramento concorrentes preservam consumo + retorno", async () => {
    await prepare();
    await authorize().expect(201);
    const results = await race(db, distributionLock, [
      () => post("/cestas-adicionais/1/entregar").then((r) => r.status),
      () => post("/distribuicoes/1/encerrar").then((r) => r.status),
    ]);
    expect(results[1]).toEqual({ status: "fulfilled", value: 204 });
    expect([200, 409]).toContain(
      results[0]?.status === "fulfilled" ? results[0].value : null,
    );
    expect(
      await scalar(
        "SELECT quantidade_consumida+quantidade_retornada value FROM pastoral.distribuicoes_liberacoes_cestas WHERE id=1",
      ),
    ).toBe(4);
    expect(
      await scalar(
        "SELECT quantidade_liberada-quantidade_consumida-quantidade_retornada value FROM pastoral.distribuicoes_liberacoes_cestas WHERE id=1",
      ),
    ).toBe(0);
  });
});

describe("concorrência de insumos/reservas/inventário", () => {
  it("perdas concorrentes de 7 sobre saldo 10: uma vence e saldo termina 3", async () => {
    const results = await race(db, stockLock, [
      () => loss(7).then((r) => r.status),
      () => loss(7).then((r) => r.status),
    ]);
    expect(
      results
        .map((r) => (r.status === "fulfilled" ? r.value : r.reason))
        .sort(),
    ).toEqual([201, 409]);
    expect(await physical()).toBe(3);
    expect(
      await scalar("SELECT count(*) value FROM pastoral.perdas_estoque"),
    ).toBe(1);
  });
  it("aprovações concorrentes de 8 sobre saldo 10: uma reserva apenas", async () => {
    await db.query(
      "UPDATE pastoral.planejamentos_cesta_versoes SET quantidade_planejada=8 WHERE id=1",
    );
    await secondPlan(8);
    const results = await race(db, stockLock, [
      () => post("/planejamentos/1/aprovar").then((r) => r.status),
      () => post("/planejamentos/2/aprovar").then((r) => r.status),
    ]);
    expect(
      results
        .map((r) => (r.status === "fulfilled" ? r.value : r.reason))
        .sort(),
    ).toEqual([204, 409]);
    expect(
      await scalar(
        "SELECT sum(quantidade_reservada) value FROM pastoral.reservas_insumos",
      ),
    ).toBe(8);
    expect(await physical()).toBe(10);
  });
  it("as funções SQL também serializam perdas, sem depender do adapter", async () => {
    const operation = () =>
      sqlTransaction(db, async (c) => {
        await c.query("SELECT pastoral.registrar_perda_estoque(1,7,1,NULL,1)");
      });
    const results = await race(db, stockLock, [operation, operation]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await physical()).toBe(3);
  });
  it("montagem e perda concorrentes nunca tornam estoque negativo", async () => {
    await post("/planejamentos/1/aprovar").expect(204);
    const results = await race(db, stockLock, [
      () => loss(8).then((r) => r.status),
      () =>
        post("/estoque/lotes-montagem", {
          planejamentoVersaoId: "1",
          quantidade: 4,
        }).then((r) => r.status),
    ]);
    expect(
      results
        .map((r) => (r.status === "fulfilled" ? r.value : r.reason))
        .sort(),
    ).toEqual([201, 409]);
    expect([2, 6]).toContain(await physical());
  });
  it("duas montagens disputam a mesma reserva, sem dupla baixa", async () => {
    await post("/planejamentos/1/aprovar").expect(204);
    const operation = () =>
      post("/estoque/lotes-montagem", {
        planejamentoVersaoId: "1",
        quantidade: 4,
      }).then((r) => r.status);
    const results = await race(db, stockLock, [operation, operation]);
    expect(
      results
        .map((r) => (r.status === "fulfilled" ? r.value : r.reason))
        .sort(),
    ).toEqual([201, 409]);
    expect(await physical()).toBe(6);
    expect(
      await scalar("SELECT count(*) value FROM pastoral.lotes_montagem"),
    ).toBe(1);
  });
  it("inventário válido aplica contagem e impede alterações após conclusão", async () => {
    await post("/estoque/inventarios").expect(201);
    await request(app)
      .put("/api/v1/estoque/inventarios/1/itens/1")
      .set(headers())
      .send({ saldoFisico: 6 })
      .expect(204);
    await post("/estoque/inventarios/1/concluir").expect(204);
    expect(await physical()).toBe(6);
    await request(app)
      .put("/api/v1/estoque/inventarios/1/itens/1")
      .set(headers())
      .send({ saldoFisico: 8 })
      .expect(404);
  });
  it("movimento após abertura torna inventário desatualizado, sem ajuste parcial", async () => {
    await post("/estoque/inventarios").expect(201);
    await request(app)
      .put("/api/v1/estoque/inventarios/1/itens/1")
      .set(headers())
      .send({ saldoFisico: 2 })
      .expect(204);
    await loss(3).expect(201);
    const r = await post("/estoque/inventarios/1/concluir").expect(409);
    expect(r.body.error.code).toBe("INVENTARIO_DESATUALIZADO");
    expect(await physical()).toBe(7);
    expect(
      await state("SELECT status FROM pastoral.inventarios WHERE id=1"),
    ).toEqual({ status: "ABERTO" });
    expect(
      await scalar(
        "SELECT count(*) value FROM pastoral.movimentacoes_insumos WHERE tipo='AJUSTE_INVENTARIO'",
      ),
    ).toBe(0);
  });
  it("inventário e perda concorrentes: resultado serial válido ou conflito, nunca negativo", async () => {
    await post("/estoque/inventarios").expect(201);
    await request(app)
      .put("/api/v1/estoque/inventarios/1/itens/1")
      .set(headers())
      .send({ saldoFisico: 2 })
      .expect(204);
    const results = await race(db, stockLock, [
      () => post("/estoque/inventarios/1/concluir").then((r) => r.status),
      () => loss(7).then((r) => r.status),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const statuses = results.map((r) =>
      r.status === "fulfilled" ? r.value : 500,
    );
    expect([
      [204, 409],
      [409, 201],
    ]).toContainEqual(statuses);
    expect([2, 3]).toContain(await physical());
  });
  it("contagem e conclusão concorrentes persistem somente a contagem aplicada", async () => {
    await post("/estoque/inventarios").expect(201);
    const results = await race(db, stockLock, [
      () =>
        request(app)
          .put("/api/v1/estoque/inventarios/1/itens/1")
          .set(headers())
          .send({ saldoFisico: 6 })
          .then((r) => r.status),
      () => post("/estoque/inventarios/1/concluir").then((r) => r.status),
    ]);
    expect(results[1]).toEqual({ status: "fulfilled", value: 204 });
    expect([204, 404]).toContain(
      results[0]?.status === "fulfilled" ? results[0].value : null,
    );
    expect(await physical()).toBe(
      await scalar(
        "SELECT saldo_fisico value FROM pastoral.inventarios_itens WHERE inventario_id=1",
      ),
    );
    expect(
      await state("SELECT status FROM pastoral.inventarios WHERE id=1"),
    ).toEqual({ status: "CONCLUIDO" });
  });
  it("duas liberações concorrentes não alocam o mesmo saldo do lote", async () => {
    await post("/planejamentos/1/aprovar").expect(204);
    await post("/estoque/lotes-montagem", {
      planejamentoVersaoId: "1",
      quantidade: 4,
    }).expect(201);
    const operation = () =>
      post("/distribuicoes/1/liberacoes-cestas", {
        loteMontagemId: "1",
        quantidade: 3,
      }).then((r) => r.status);
    const results = await race(db, stockLock, [operation, operation]);
    expect(
      results
        .map((r) => (r.status === "fulfilled" ? r.value : r.reason))
        .sort(),
    ).toEqual([201, 409]);
    expect(
      await scalar(
        "SELECT quantidade_disponivel value FROM pastoral.lotes_montagem WHERE id=1",
      ),
    ).toBe(1);
    expect(
      await scalar(
        "SELECT sum(quantidade_liberada) value FROM pastoral.distribuicoes_liberacoes_cestas",
      ),
    ).toBe(3);
  });
});
