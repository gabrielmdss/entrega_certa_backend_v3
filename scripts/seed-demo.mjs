import "dotenv/config";
import http from "node:http";
import jwt from "jsonwebtoken";
import pg from "pg";
import { createApp } from "../dist/main/app.js";

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
  console.log(`[seed-demo] ${step}${detail ? " — " + detail : ""}`);
}

async function upsertCatalog(table, uniqueCol, row) {
  const cols = Object.keys(row);
  const values = Object.values(row);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(",");
  const set = cols.filter((c) => c !== uniqueCol).map((c) => `${c}=EXCLUDED.${c}`).join(",");
  const r = await pool.query(
    `INSERT INTO pastoral.${table}(${cols.join(",")}) VALUES(${placeholders})
     ON CONFLICT (${uniqueCol}) DO UPDATE SET ${set || `${uniqueCol}=EXCLUDED.${uniqueCol}`}
     RETURNING id::text`,
    values,
  );
  return r.rows[0].id;
}

async function seedCatalogos() {
  log("Catálogos: tipos de documento, categorias, grupos, motivos");
  const tipoDocumentoId = await upsertCatalog("tipos_documento", "codigo", {
    codigo: "CPF",
    nome: "CPF",
    ativo: true,
  });
  const categoriaId = await upsertCatalog("categorias_prioridade_insumo", "codigo", {
    codigo: "ALIMENTO_BASICO",
    descricao: "Alimento básico",
    ordem_prioridade: 1,
  });
  const grupoId = await upsertCatalog("grupos_distribuicao", "codigo", {
    codigo: "DEMO-A",
    nome: "Grupo Demonstração",
    regra_calendario: "SEGUNDO_SABADO",
    ordem: 1,
    ativo: true,
  });
  const motivoDesligamentoId = await upsertCatalog("motivos_desligamento", "codigo", {
    codigo: "MUDANCA_ENDERECO",
    descricao: "Mudança de endereço",
    ativo: true,
  });
  await upsertCatalog("motivos_perda_estoque", "codigo", {
    codigo: "VENCIDO",
    descricao: "Produto vencido",
    ativo: true,
  });
  return { tipoDocumentoId, categoriaId, grupoId, motivoDesligamentoId };
}

async function getAdminToken() {
  const admin = (await pool.query("SELECT id::text FROM pastoral.usuarios WHERE lower(login)='admin' AND ativo")).rows[0];
  if (!admin) {
    console.error('[seed-demo] Usuário "admin" não encontrado. Rode "npm run users:seed" primeiro.');
    process.exit(1);
  }
  return jwt.sign({}, process.env.JWT_SECRET, { subject: admin.id, expiresIn: "1h" });
}

async function startApp() {
  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

function client(baseUrl, token) {
  return async (method, path, body) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    return { status: res.status, json };
  };
}

async function seedCapacidade(api) {
  log("Capacidade de atendimento");
  const atual = await api("GET", "/api/v1/capacidade");
  if (atual.status === 200 && atual.json?.data?.capacidade >= 50) return;
  const r = await api("PUT", "/api/v1/capacidade", {
    capacidade: 50,
    justificativa: "Capacidade inicial para carga de demonstração",
  });
  if (r.status !== 200) throw new Error(`Falha ao configurar capacidade: ${JSON.stringify(r.json)}`);
}

async function seedPessoasEBeneficiarios(api, grupoId) {
  log("Beneficiários: pessoas + admissão");
  const nomes = [
    { nome: "Maria da Silva Souza", documento: "11122233396" },
    { nome: "João Pereira Costa", documento: "22233344495" },
    { nome: "Ana Paula Oliveira", documento: "33344455594" },
  ];
  const beneficiarioIds = [];
  for (const p of nomes) {
    let pessoaId = (
      await pool.query(
        "SELECT pd.pessoa_id::text id FROM pastoral.pessoas_documentos pd WHERE pd.ativo AND pd.numero_normalizado=pastoral.fn_normalizar_documento($1)",
        [p.documento],
      )
    ).rows[0]?.id;
    if (!pessoaId) {
      const r = await api("POST", "/api/v1/pessoas", {
        nomeCompleto: p.nome,
        dataNascimento: "1985-04-12",
        telefone: "11999990000",
        documentos: [{ tipo: "CPF", numero: p.documento, principal: true }],
      });
      if (r.status !== 201) throw new Error(`Falha ao criar pessoa ${p.nome}: ${JSON.stringify(r.json)}`);
      pessoaId = r.json.data.id;
    }
    let beneficiarioId = (
      await pool.query("SELECT id::text FROM pastoral.beneficiarios WHERE pessoa_id=$1", [pessoaId])
    ).rows[0]?.id;
    if (!beneficiarioId) {
      const r = await api("POST", "/api/v1/beneficiarios", { pessoaId, grupoId });
      if (r.status !== 201) throw new Error(`Falha ao admitir ${p.nome}: ${JSON.stringify(r.json)}`);
      beneficiarioId = r.json.data.id;
    }
    beneficiarioIds.push(beneficiarioId);
  }
  return beneficiarioIds;
}

async function seedEstoque(api, categoriaId) {
  log("Estoque: insumos, doador e entrada");
  const itens = [
    { nome: "Arroz", descricao: "Arroz branco 5kg", quantidadeReferencia: 5, unidadeMedida: "kg" },
    { nome: "Feijão", descricao: "Feijão carioca 1kg", quantidadeReferencia: 1, unidadeMedida: "kg" },
    { nome: "Óleo de Soja", descricao: "Óleo de soja 900ml", quantidadeReferencia: 0.9, unidadeMedida: "l" },
    { nome: "Açúcar", descricao: "Açúcar refinado 1kg", quantidadeReferencia: 1, unidadeMedida: "kg" },
    { nome: "Macarrão", descricao: "Macarrão espaguete 500g", quantidadeReferencia: 0.5, unidadeMedida: "kg" },
  ];
  const apresentacaoIds = [];
  for (const item of itens) {
    let apresentacaoId = (
      await pool.query(
        "SELECT ia.id::text FROM pastoral.insumos i JOIN pastoral.insumos_apresentacoes ia ON ia.insumo_id=i.id WHERE lower(i.nome)=lower($1) LIMIT 1",
        [item.nome],
      )
    ).rows[0]?.id;
    if (!apresentacaoId) {
      const r = await api("POST", "/api/v1/estoque/insumos", {
        nome: item.nome,
        categoriaPrioridadeId: categoriaId,
        apresentacao: {
          descricao: item.descricao,
          quantidadeReferencia: item.quantidadeReferencia,
          unidadeMedida: item.unidadeMedida,
        },
      });
      if (r.status !== 201) throw new Error(`Falha ao cadastrar insumo ${item.nome}: ${JSON.stringify(r.json)}`);
      apresentacaoId = r.json.data.apresentacaoId;
    }
    apresentacaoIds.push(apresentacaoId);
  }

  let doadorId = (await pool.query("SELECT id::text FROM pastoral.doadores WHERE nome=$1", ["Doador Demonstração"])).rows[0]?.id;
  if (!doadorId) {
    const r = await api("POST", "/api/v1/doadores", { tipo: "INSTITUICAO", nome: "Doador Demonstração" });
    if (r.status !== 201) throw new Error(`Falha ao criar doador: ${JSON.stringify(r.json)}`);
    doadorId = r.json.data.id;
  }

  const saldoBaixo = (
    await pool.query(
      "SELECT count(*)::int n FROM pastoral.vw_saldo_insumos WHERE apresentacao_insumo_id = ANY($1) AND saldo_fisico < 1000",
      [apresentacaoIds],
    )
  ).rows[0].n;
  if (saldoBaixo > 0) {
    const r = await api("POST", "/api/v1/estoque/entradas", {
      tipo: "DOACAO",
      doadorId,
      dataEntrada: new Date().toISOString().slice(0, 10),
      observacao: "Carga inicial de demonstração",
      itens: apresentacaoIds.map((apresentacaoInsumoId) => ({ apresentacaoInsumoId, quantidade: 1000 })),
    });
    if (r.status !== 201) throw new Error(`Falha ao registrar entrada de estoque: ${JSON.stringify(r.json)}`);
  }
  return apresentacaoIds;
}

async function seedModeloCesta(api, apresentacaoIds) {
  log("Cesta: modelo e versão");
  let modeloId = (await pool.query("SELECT id::text FROM pastoral.modelos_cesta WHERE nome=$1", ["Cesta Básica Demonstração"])).rows[0]?.id;
  if (!modeloId) {
    const r = await api("POST", "/api/v1/cestas/modelos", { nome: "Cesta Básica Demonstração", tipo: "REGULAR" });
    if (r.status !== 201) throw new Error(`Falha ao criar modelo de cesta: ${JSON.stringify(r.json)}`);
    modeloId = r.json.data.id;
  }
  let versaoId = (
    await pool.query(
      "SELECT id::text FROM pastoral.modelos_cesta_versoes WHERE modelo_cesta_id=$1 ORDER BY numero_versao DESC LIMIT 1",
      [modeloId],
    )
  ).rows[0]?.id;
  if (!versaoId) {
    const itens = apresentacaoIds.map((apresentacaoInsumoId) => ({ apresentacaoInsumoId, quantidade: 1 }));
    const r = await api("POST", `/api/v1/cestas/modelos/${modeloId}/versoes`, {
      metaItens: itens.length,
      itens,
    });
    if (r.status !== 201) throw new Error(`Falha ao criar versão do modelo: ${JSON.stringify(r.json)}`);
    versaoId = r.json.data.id;
  }
  return { modeloId, versaoId };
}

async function seedCompetencia(api) {
  log("Competência do mês atual");
  const now = new Date();
  const ano = now.getFullYear();
  const mes = now.getMonth() + 1;
  let competenciaId = (await pool.query("SELECT id::text FROM pastoral.competencias WHERE ano=$1 AND mes=$2", [ano, mes])).rows[0]?.id;
  if (!competenciaId) {
    const r = await api("POST", "/api/v1/competencias/gerar", { ano, mes });
    if (r.status !== 201) throw new Error(`Falha ao gerar competência: ${JSON.stringify(r.json)}`);
    competenciaId = r.json.data.id;
  }
  return competenciaId;
}

async function seedPlanejamentoEMontagem(api, competenciaId, modeloCestaVersaoId, quantidade) {
  log("Planejamento: criar, aprovar e montar lote");
  let versaoId = (
    await pool.query(
      `SELECT v.id::text FROM pastoral.planejamentos_cesta_versoes v
       JOIN pastoral.planejamentos_cesta p ON p.id=v.planejamento_cesta_id
       JOIN pastoral.modelos_cesta_versoes mv ON mv.modelo_cesta_id=p.modelo_cesta_id
       WHERE p.competencia_id=$1 AND mv.id=$2 ORDER BY v.numero_versao DESC LIMIT 1`,
      [competenciaId, modeloCestaVersaoId],
    )
  ).rows[0]?.id;
  let status = versaoId
    ? (await pool.query("SELECT status FROM pastoral.planejamentos_cesta_versoes WHERE id=$1", [versaoId])).rows[0].status
    : null;
  if (!versaoId) {
    const r = await api("POST", "/api/v1/planejamentos", { competenciaId, modeloCestaVersaoId, quantidade });
    if (r.status !== 201) throw new Error(`Falha ao criar planejamento: ${JSON.stringify(r.json)}`);
    versaoId = r.json.data.versaoId;
    status = "SIMULACAO";
    if (status === "SIMULACAO") {
      const ap = await api("POST", `/api/v1/planejamentos/${r.json.data.id}/aprovar`);
      if (ap.status !== 204) throw new Error(`Falha ao aprovar planejamento: ${JSON.stringify(ap.json)}`);
      status = "APROVADO";
    }
  } else if (status === "SIMULACAO") {
    const planejamentoId = (
      await pool.query("SELECT planejamento_cesta_id::text id FROM pastoral.planejamentos_cesta_versoes WHERE id=$1", [versaoId])
    ).rows[0].id;
    const ap = await api("POST", `/api/v1/planejamentos/${planejamentoId}/aprovar`);
    if (ap.status !== 204) throw new Error(`Falha ao aprovar planejamento: ${JSON.stringify(ap.json)}`);
    status = "APROVADO";
  }

  let loteId = (await pool.query("SELECT id::text FROM pastoral.lotes_montagem WHERE planejamento_versao_id=$1", [versaoId])).rows[0]?.id;
  if (!loteId) {
    const r = await api("POST", "/api/v1/estoque/lotes-montagem", { planejamentoVersaoId: versaoId, quantidade });
    if (r.status !== 201) throw new Error(`Falha ao montar lote: ${JSON.stringify(r.json)}`);
    loteId = r.json.data.id;
  }
  return loteId;
}

async function seedDistribuicaoEAtendimento(api, competenciaId, grupoId, loteId, beneficiarioIds) {
  log("Distribuição: abrir, liberar cestas, check-in e retirada");
  const distribuicaoId = (
    await pool.query(
      "SELECT id::text FROM pastoral.distribuicoes WHERE competencia_id=$1 AND grupo_distribuicao_id=$2",
      [competenciaId, grupoId],
    )
  ).rows[0]?.id;
  if (!distribuicaoId) {
    log("Nenhuma distribuição gerada automaticamente para o grupo; etapa ignorada.");
    return;
  }
  const status = (await pool.query("SELECT status FROM pastoral.distribuicoes WHERE id=$1", [distribuicaoId])).rows[0].status;
  if (status === "PLANEJADA" || status === "PREPARADA") {
    const r = await api("POST", `/api/v1/distribuicoes/${distribuicaoId}/abrir`);
    if (r.status !== 204) throw new Error(`Falha ao abrir distribuição: ${JSON.stringify(r.json)}`);
  }

  const jaLiberado = (
    await pool.query(
      "SELECT 1 FROM pastoral.distribuicoes_liberacoes_cestas WHERE distribuicao_id=$1 AND lote_montagem_id=$2",
      [distribuicaoId, loteId],
    )
  ).rowCount;
  if (!jaLiberado) {
    const r = await api("POST", `/api/v1/distribuicoes/${distribuicaoId}/liberacoes-cestas`, {
      loteMontagemId: loteId,
      quantidade: beneficiarioIds.length,
    });
    if (r.status !== 201) throw new Error(`Falha ao liberar cestas: ${JSON.stringify(r.json)}`);
  }

  for (const beneficiarioId of beneficiarioIds) {
    const jaCheckin = (
      await pool.query(
        "SELECT 1 FROM pastoral.distribuicoes_checkins WHERE distribuicao_id=$1 AND beneficiario_id=$2",
        [distribuicaoId, beneficiarioId],
      )
    ).rowCount;
    if (!jaCheckin) {
      const r = await api("POST", `/api/v1/distribuicoes/${distribuicaoId}/check-ins`, { beneficiarioId });
      if (r.status !== 201) throw new Error(`Falha no check-in do beneficiário ${beneficiarioId}: ${JSON.stringify(r.json)}`);
    }
  }

  const [primeiro, ...resto] = beneficiarioIds;
  for (const beneficiarioId of [primeiro]) {
    const jaRetirou = (
      await pool.query(
        "SELECT 1 FROM pastoral.retiradas WHERE distribuicao_id=$1 AND beneficiario_id=$2 AND status='VALIDA'",
        [distribuicaoId, beneficiarioId],
      )
    ).rowCount;
    if (!jaRetirou) {
      const r = await api("POST", `/api/v1/distribuicoes/${distribuicaoId}/retiradas`, {
        beneficiarioId,
        tipo: "TITULAR",
        formaIdentificacao: "DOCUMENTO",
      });
      if (r.status !== 201) throw new Error(`Falha ao registrar retirada: ${JSON.stringify(r.json)}`);
    }
  }
  void resto;
}

async function main() {
  const token = await getAdminToken();
  const { server, baseUrl } = await startApp();
  const api = client(baseUrl, token);
  try {
    const { categoriaId, grupoId } = await seedCatalogos();
    await seedCapacidade(api);
    const beneficiarioIds = await seedPessoasEBeneficiarios(api, grupoId);
    const apresentacaoIds = await seedEstoque(api, categoriaId);
    const { versaoId: modeloCestaVersaoId } = await seedModeloCesta(api, apresentacaoIds);
    const competenciaId = await seedCompetencia(api);
    const loteId = await seedPlanejamentoEMontagem(api, competenciaId, modeloCestaVersaoId, beneficiarioIds.length);
    await seedDistribuicaoEAtendimento(api, competenciaId, grupoId, loteId, beneficiarioIds);
    log("Carga de demonstração concluída com sucesso.");
  } finally {
    server.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[seed-demo] Falhou:", error.message);
  process.exit(1);
});
