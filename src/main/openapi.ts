const security = [{ bearerAuth: [] }];
const responses = {
  "200": { description: "Sucesso" },
  "201": { description: "Criado" },
  "204": { description: "Concluído" },
  "400": { description: "Entrada inválida" },
  "401": { description: "Não autenticado" },
  "403": { description: "Permissão negada" },
  "404": { description: "Não encontrado" },
  "409": { description: "Conflito" },
};
const get = { security, responses };
const post = { security, responses };
const retiradaExample = {
  beneficiarioId: "8",
  tipo: "REPRESENTANTE",
  formaIdentificacao: "REPRESENTANTE",
  representante: {
    nome: "João da Silva",
    documento: "123456789",
    relacao: "VIZINHO",
    autorizacaoDeclaratoria: true,
  },
};
export const openApiDocument = {
  openapi: "3.1.0",
  info: { title: "Pastoral API", version: "0.9.0" },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
  },
  paths: {
    "/health": { get: { responses: { "200": { description: "OK" } } } },
    "/ready": { get: { responses } },
    "/api/v1/auth/login": { post: { responses } },
    "/api/v1/auth/me": { get },
    "/api/v1/capacidade": { get, put: post },
    "/api/v1/beneficiarios": { get, post },
    "/api/v1/beneficiarios/{id}": { get },
    "/api/v1/candidaturas": { get, post },
    "/api/v1/candidaturas/{id}/admitir": { post },
    "/api/v1/competencias": { get },
    "/api/v1/competencias/gerar": { post },
    "/api/v1/distribuicoes": { get },
    "/api/v1/distribuicoes/{id}": { get },
    "/api/v1/distribuicoes/{id}/abrir": { post },
    "/api/v1/distribuicoes/{id}/encerrar": {
      post: {
        ...post,
        summary: "Encerra, classifica direitos e reconcilia cestas liberadas",
      },
    },
    "/api/v1/distribuicoes/{id}/check-ins": { get, post },
    "/api/v1/distribuicoes/{id}/retiradas": {
      get: { ...get, summary: "Consulta retiradas com filtros" },
      post: {
        ...post,
        summary: "Registra retirada e consome cesta física liberada",
        requestBody: {
          required: true,
          content: { "application/json": { example: retiradaExample } },
        },
      },
    },
    "/api/v1/distribuicoes/{id}/remarcar": { post },
    "/api/v1/distribuicoes/{id}/liberacoes-cestas": {
      get,
      post: { ...post, summary: "Aloca cesta montada; não registra entrega" },
    },
    "/api/v1/estoque/insumos": { get, post },
    "/api/v1/estoque/categorias-prioridade": { get },
    "/api/v1/estoque/insumos/{id}": { get },
    "/api/v1/estoque/entradas": { post },
    "/api/v1/estoque/perdas": { post },
    "/api/v1/estoque/inventarios": { post },
    "/api/v1/estoque/inventarios/{id}": { get },
    "/api/v1/estoque/inventarios/{id}/itens/{apresentacaoId}": { put: post },
    "/api/v1/estoque/inventarios/{id}/concluir": { post },
    "/api/v1/estoque/lotes-montagem": { get, post },
    "/api/v1/estoque/lotes-montagem/{id}": { get },
    "/api/v1/estoque/lotes-montagem/{id}/desmontar": { post },
    "/api/v1/estoque/lotes-montagem/{id}/ajustes": { post },
    "/api/v1/doadores": { get, post },
    "/api/v1/doadores/{id}": { put: post },
    "/api/v1/cestas/modelos": { get, post },
    "/api/v1/cestas/modelos/{id}": { get },
    "/api/v1/cestas/modelos/{id}/versoes": { post },
    "/api/v1/planejamentos/simular": { post },
    "/api/v1/planejamentos": { get, post },
    "/api/v1/planejamentos/{id}": { get },
    "/api/v1/planejamentos/{id}/aprovar": { post },
    "/api/v1/planejamentos/{id}/revisoes": { post },
    "/api/v1/dashboard": {
      get: {
        ...get,
        summary: "Dashboard operacional e projeção de três meses",
      },
    },
    "/api/v1/relatorios/distribuicoes": {
      get: { ...get, summary: "Relatório paginado de distribuições" },
    },
    "/api/v1/relatorios/beneficiarios": {
      get: { ...get, summary: "Relatório paginado de beneficiários" },
    },
    "/api/v1/relatorios/estoque": {
      get: { ...get, summary: "Relatório paginado de estoque" },
    },
    "/api/v1/auditoria": {
      get: { ...get, summary: "Auditoria sanitizada, filtrada e paginada" },
    },
    "/api/v1/auditoria/{id}": {
      get: { ...get, summary: "Detalhe sanitizado de auditoria" },
    },
    "/api/v1/admin/status": {
      get: { ...get, summary: "Estado técnico autenticado da API" },
    },
    "/api/v1/beneficiarios/{id}/historico": {
      get: { ...get, summary: "Histórico assistencial do beneficiário" },
    },
    "/api/v1/distribuicoes/{id}/historico": {
      get: { ...get, summary: "Histórico operacional da distribuição" },
    },
    "/api/v1/ausencias/{id}/justificativas": {
      post: { ...post, summary: "Registra justificativa pendente" },
    },
    "/api/v1/justificativas/{id}/avaliar": {
      post: { ...post, summary: "Aceita ou rejeita justificativa" },
    },
    "/api/v1/retiradas/{id}": {
      get: { ...get, summary: "Obtém retirada e representante mascarado" },
    },
    "/api/v1/retiradas/{id}/estornar": {
      post: { ...post, summary: "Estorna conforme operador, dia e permissões" },
    },
  },
} as const;
