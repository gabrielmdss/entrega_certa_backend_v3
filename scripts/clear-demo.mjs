import "dotenv/config";
import pg from "pg";

// Identifica exatamente os dados criados por scripts/seed-demo.mjs pelas mesmas
// chaves naturais usadas lá, e remove em ordem segura de FK. Não mexe em
// catálogos genéricos (tipos_documento, categorias_prioridade_insumo,
// motivos_*), pois são configuração reutilizável, não dado de apresentação.

const DOCUMENTOS = ["11122233396", "22233344495", "33344455594"];
const INSUMOS = ["Arroz", "Feijão", "Óleo de Soja", "Açúcar", "Macarrão"];
const DOADOR = "Doador Demonstração";
const MODELO_CESTA = "Cesta Básica Demonstração";
const GRUPO_CODIGO = "DEMO-A";

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  options: `-c search_path=${process.env.DB_SCHEMA ?? "pastoral"},public`,
});

function log(step, detail = "") {
  console.log(`[clear-demo] ${step}${detail ? " — " + detail : ""}`);
}

async function ids(client, sql, params = []) {
  return (await client.query(sql, params)).rows.map((r) => r.id);
}

async function del(client, table, whereSql, params) {
  const r = await client.query(`DELETE FROM pastoral.${table} WHERE ${whereSql}`, params);
  if (r.rowCount) log(`  ${table}`, `${r.rowCount} linha(s)`);
  return r.rowCount;
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const pessoaIds = await ids(
      client,
      "SELECT pessoa_id::text id FROM pastoral.pessoas_documentos WHERE numero_normalizado = ANY(SELECT pastoral.fn_normalizar_documento(unnest($1::text[])))",
      [DOCUMENTOS],
    );
    const beneficiarioIds = pessoaIds.length
      ? await ids(client, "SELECT id::text id FROM pastoral.beneficiarios WHERE pessoa_id = ANY($1)", [pessoaIds])
      : [];
    const grupoId = (await client.query("SELECT id::text id FROM pastoral.grupos_distribuicao WHERE codigo=$1", [GRUPO_CODIGO])).rows[0]?.id ?? null;
    const modeloId = (await client.query("SELECT id::text id FROM pastoral.modelos_cesta WHERE nome=$1", [MODELO_CESTA])).rows[0]?.id ?? null;
    const doadorId = (await client.query("SELECT id::text id FROM pastoral.doadores WHERE nome=$1", [DOADOR])).rows[0]?.id ?? null;
    const apresentacaoIds = await ids(
      client,
      "SELECT ia.id::text id FROM pastoral.insumos_apresentacoes ia JOIN pastoral.insumos i ON i.id=ia.insumo_id WHERE i.nome = ANY($1)",
      [INSUMOS],
    );
    const insumoIds = await ids(client, "SELECT id::text id FROM pastoral.insumos WHERE nome = ANY($1)", [INSUMOS]);
    const planejamentoVersaoIds = modeloId
      ? await ids(
          client,
          `SELECT v.id::text id FROM pastoral.planejamentos_cesta_versoes v
           JOIN pastoral.planejamentos_cesta p ON p.id=v.planejamento_cesta_id
           WHERE p.modelo_cesta_id=$1`,
          [modeloId],
        )
      : [];
    const planejamentoIds = modeloId
      ? await ids(client, "SELECT id::text id FROM pastoral.planejamentos_cesta WHERE modelo_cesta_id=$1", [modeloId])
      : [];
    const loteIds = planejamentoVersaoIds.length
      ? await ids(client, "SELECT id::text id FROM pastoral.lotes_montagem WHERE planejamento_versao_id = ANY($1)", [planejamentoVersaoIds])
      : [];
    const distribuicaoIds = grupoId
      ? await ids(client, "SELECT id::text id FROM pastoral.distribuicoes WHERE grupo_distribuicao_id=$1", [grupoId])
      : [];
    const competenciaIds = grupoId
      ? await ids(
          client,
          "SELECT DISTINCT competencia_id::text id FROM pastoral.distribuicoes WHERE grupo_distribuicao_id=$1",
          [grupoId],
        )
      : [];

    log("Removendo dados de atendimento/distribuição");
    if (distribuicaoIds.length) {
      await del(client, "entregas_cestas_lotes", "entrega_cesta_id IN (SELECT id FROM pastoral.entregas_cestas WHERE distribuicao_id = ANY($1))", [distribuicaoIds]);
      await del(client, "entregas_cestas", "distribuicao_id = ANY($1)", [distribuicaoIds]);
      await del(client, "retiradas_estornos", "retirada_id IN (SELECT id FROM pastoral.retiradas WHERE distribuicao_id = ANY($1))", [distribuicaoIds]);
      await del(client, "retiradas", "distribuicao_id = ANY($1)", [distribuicaoIds]);
      await del(client, "distribuicoes_checkins", "distribuicao_id = ANY($1)", [distribuicaoIds]);
      await del(client, "distribuicoes_liberacoes_cestas", "distribuicao_id = ANY($1)", [distribuicaoIds]);
      await del(client, "distribuicoes_historico", "distribuicao_id = ANY($1)", [distribuicaoIds]);
      await del(client, "cestas_adicionais", "distribuicao_id = ANY($1)", [distribuicaoIds]);
    }
    if (beneficiarioIds.length) {
      await del(client, "direitos_beneficio", "beneficiario_id = ANY($1)", [beneficiarioIds]);
      await del(client, "beneficiarios_grupos_historico", "beneficiario_id = ANY($1)", [beneficiarioIds]);
      await del(client, "beneficiarios_desligamentos", "beneficiario_id = ANY($1)", [beneficiarioIds]);
    }
    if (distribuicaoIds.length) await del(client, "distribuicoes", "id = ANY($1)", [distribuicaoIds]);

    log("Removendo montagem e reservas");
    if (loteIds.length) {
      await del(client, "movimentacoes_cestas", "lote_montagem_id = ANY($1)", [loteIds]);
      await del(client, "lotes_montagem_ajustes_itens", "ajuste_id IN (SELECT id FROM pastoral.lotes_montagem_ajustes WHERE lote_montagem_id = ANY($1))", [loteIds]);
      await del(client, "lotes_montagem_ajustes", "lote_montagem_id = ANY($1)", [loteIds]);
      await del(client, "lotes_montagem_itens", "lote_montagem_id = ANY($1)", [loteIds]);
    }
    if (apresentacaoIds.length) await del(client, "movimentacoes_insumos", "apresentacao_insumo_id = ANY($1)", [apresentacaoIds]);
    if (loteIds.length) await del(client, "lotes_montagem", "id = ANY($1)", [loteIds]);
    if (planejamentoVersaoIds.length) {
      await del(client, "reservas_insumos", "planejamento_versao_id = ANY($1)", [planejamentoVersaoIds]);
      await del(client, "planejamentos_cesta_versoes_itens", "planejamento_versao_id = ANY($1)", [planejamentoVersaoIds]);
      await del(client, "planejamentos_cesta_versoes", "id = ANY($1)", [planejamentoVersaoIds]);
    }
    if (planejamentoIds.length) await del(client, "planejamentos_cesta", "id = ANY($1)", [planejamentoIds]);
    if (competenciaIds.length) await del(client, "competencias", "id = ANY($1) AND NOT EXISTS (SELECT 1 FROM pastoral.distribuicoes d WHERE d.competencia_id=pastoral.competencias.id)", [competenciaIds]);

    log("Removendo estoque de demonstração");
    if (doadorId) {
      await del(client, "entradas_estoque_itens", "entrada_estoque_id IN (SELECT id FROM pastoral.entradas_estoque WHERE doador_id=$1)", [doadorId]);
      await del(client, "entradas_estoque", "doador_id=$1", [doadorId]);
    }
    if (modeloId) {
      await del(client, "modelos_cesta_versoes_itens", "modelo_cesta_versao_id IN (SELECT id FROM pastoral.modelos_cesta_versoes WHERE modelo_cesta_id=$1)", [modeloId]);
      await del(client, "modelos_cesta_versoes", "modelo_cesta_id=$1", [modeloId]);
      await del(client, "modelos_cesta", "id=$1", [modeloId]);
    }
    if (apresentacaoIds.length) await del(client, "insumos_apresentacoes", "id = ANY($1)", [apresentacaoIds]);
    if (insumoIds.length) await del(client, "insumos", "id = ANY($1)", [insumoIds]);
    if (doadorId) await del(client, "doadores", "id=$1", [doadorId]);

    log("Removendo beneficiários e pessoas");
    if (beneficiarioIds.length) await del(client, "beneficiarios", "id = ANY($1)", [beneficiarioIds]);
    if (pessoaIds.length) {
      await del(client, "pessoas_arquivos", "pessoa_id = ANY($1)", [pessoaIds]);
      await del(client, "pessoas_enderecos", "pessoa_id = ANY($1)", [pessoaIds]);
      await del(client, "pessoas_documentos", "pessoa_id = ANY($1)", [pessoaIds]);
    }
    const allEntityIds = [...pessoaIds, ...beneficiarioIds, ...distribuicaoIds];
    if (allEntityIds.length)
      await del(
        client,
        "auditoria",
        "entidade IN ('PESSOA','BENEFICIARIO','COMPETENCIA') AND entidade_id::text = ANY($1)",
        [allEntityIds],
      );
    if (pessoaIds.length) await del(client, "pessoas", "id = ANY($1)", [pessoaIds]);

    if (grupoId) await del(client, "grupos_distribuicao", "id=$1", [grupoId]);

    await client.query("COMMIT");
    log("Concluído.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[clear-demo] Falhou:", error.message);
  process.exit(1);
});
