type HttpMethod = "get" | "post" | "put";
type PathItem = Partial<Record<HttpMethod, Record<string, unknown>>>;
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const id = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", pattern: "^\\d+$" },
};
const presentationId = {
  name: "apresentacaoId",
  in: "path",
  required: true,
  schema: { type: "string", pattern: "^\\d+$" },
};
const errors = {
  "400": {
    description: "Entrada inválida",
    content: { "application/json": { schema: ref("Error") } },
  },
  "401": { description: "Não autenticado" },
  "403": { description: "Permissão negada" },
  "404": { description: "Não encontrado" },
  "409": { description: "Conflito de regra ou unicidade" },
};
function operation(
  summary: string,
  permission: string | null,
  options: {
    status?: 200 | 201 | 204;
    parameters?: unknown[];
    request?: Record<string, unknown>;
    response?: Record<string, unknown>;
    description?: string;
  } = {},
): Record<string, unknown> {
  const status = String(options.status ?? 200);
  return {
    summary,
    description: [
      options.description,
      permission ? `Permissão exigida: ${permission}.` : null,
    ]
      .filter(Boolean)
      .join(" "),
    ...(permission
      ? { security: [{ bearerAuth: [] }], "x-permission": permission }
      : {}),
    ...(options.parameters ? { parameters: options.parameters } : {}),
    ...(options.request
      ? {
          requestBody: {
            required: true,
            content: { "application/json": { schema: options.request } },
          },
        }
      : {}),
    responses: {
      [status]:
        options.status === 204
          ? { description: "Concluído sem conteúdo" }
          : {
              description: options.status === 201 ? "Criado" : "Sucesso",
              content: {
                "application/json": {
                  schema: options.response ?? ref("DataResponse"),
                },
              },
            },
      ...errors,
    },
  };
}
const path = (
  method: HttpMethod,
  summary: string,
  permission: string | null,
  options?: Parameters<typeof operation>[2],
): PathItem => ({ [method]: operation(summary, permission, options) });
const mutation = (
  summary: string,
  permission: string,
  parameters: unknown[] = [id],
  request: Record<string, unknown> = {
    type: "object",
    additionalProperties: true,
  },
  status: 201 | 204 = 204,
) => path("post", summary, permission, { parameters, request, status });

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Pastoral API",
    version: "1.0.0",
    description:
      "Contrato REST completo da API de Assistência. IDs bigint são strings e documentos pessoais são mascarados em read models operacionais.",
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
      DataResponse: {
        type: "object",
        required: ["data"],
        properties: { data: {} },
      },
      DocumentMasked: {
        type: "object",
        required: ["tipo", "numeroMascarado"],
        properties: {
          tipo: { type: "string" },
          numeroMascarado: { type: "string", example: "*********42" },
        },
      },
      PessoaListItem: {
        type: "object",
        required: [
          "id",
          "nomeCompleto",
          "dataNascimento",
          "documentos",
          "beneficiario",
        ],
        properties: {
          id: { type: "string" },
          nomeCompleto: { type: "string" },
          dataNascimento: { type: ["string", "null"], format: "date" },
          documentos: { type: "array", items: ref("DocumentMasked") },
          beneficiario: {
            oneOf: [
              { type: "null" },
              {
                type: "object",
                required: ["id", "status"],
                properties: {
                  id: { type: "string" },
                  status: { type: "string" },
                },
              },
            ],
          },
        },
      },
      PessoaCreate: {
        type: "object",
        required: ["nomeCompleto", "documentos"],
        properties: {
          nomeCompleto: { type: "string", minLength: 3 },
          dataNascimento: { type: ["string", "null"], format: "date" },
          telefone: { type: ["string", "null"] },
          documentos: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              required: ["tipo", "numero"],
              properties: {
                tipo: {
                  type: "string",
                  description:
                    "Código ativo de pastoral.tipos_documento, por exemplo CPF ou RG",
                },
                numero: { type: "string" },
                principal: { type: "boolean", default: false },
              },
            },
          },
        },
      },
      Grupo: {
        type: "object",
        required: ["id", "codigo", "nome", "regraCalendario"],
        properties: {
          id: { type: "string" },
          codigo: { type: "string" },
          nome: { type: "string" },
          regraCalendario: {
            type: "string",
            enum: ["SEGUNDO_SABADO", "QUARTO_SABADO", "MANUAL"],
          },
        },
      },
      Motivo: {
        type: "object",
        required: ["id", "codigo", "descricao"],
        properties: {
          id: { type: "string" },
          codigo: { type: "string" },
          descricao: { type: "string" },
        },
      },
      TentativaContato: {
        type: "object",
        properties: {
          resultado: {
            type: ["string", "null"],
            description:
              "Texto livre no schema atual; não existe CHECK nem conjunto estável confirmado.",
          },
          observacao: { type: ["string", "null"] },
          ocorridoEm: { type: "string", format: "date-time" },
        },
      },
      BeneficiarioDetail: {
        type: "object",
        description:
          "Read model operacional, sem observacao_restrita e sem documentos completos",
        required: [
          "id",
          "status",
          "dataAdmissao",
          "pessoa",
          "grupo",
          "ultimaRetirada",
          "direitoAtual",
          "proximoDireito",
          "pendenciasAtuais",
          "historicoResumido",
        ],
        properties: {
          id: { type: "string" },
          status: { type: "string" },
          dataAdmissao: { type: "string", format: "date" },
          pessoa: {
            type: "object",
            properties: {
              id: { type: "string" },
              nomeCompleto: { type: "string" },
              dataNascimento: { type: ["string", "null"], format: "date" },
              telefone: { type: ["string", "null"] },
              fotoPrincipal: { type: ["object", "null"] },
              documentos: { type: "array", items: ref("DocumentMasked") },
              enderecoPrincipal: { type: ["object", "null"] },
            },
          },
          grupo: { oneOf: [ref("Grupo"), { type: "null" }] },
          ultimaRetirada: { type: ["object", "null"] },
          direitoAtual: { type: ["object", "null"] },
          proximoDireito: { type: ["object", "null"] },
          pendenciasAtuais: { type: "array", items: { type: "object" } },
          historicoResumido: { type: "array", items: { type: "object" } },
        },
      },
    },
  },
  paths: {
    "/health": path("get", "Saúde do processo", null),
    "/ready": path("get", "Readiness do PostgreSQL", null),
    "/openapi.json": path("get", "Contrato OpenAPI", null),
    "/api/v1/auth/login": path("post", "Autenticar", null, {
      status: 200,
      request: {
        type: "object",
        required: ["login", "senha"],
        properties: {
          login: { type: "string" },
          senha: { type: "string", format: "password" },
        },
      },
    }),
    "/api/v1/auth/me": {
      get: {
        ...operation("Usuário autenticado", null),
        security: [{ bearerAuth: [] }],
      },
    },
    "/api/v1/pessoas": {
      get: operation("Buscar pessoas", "BENEFICIARIO_VISUALIZAR", {
        parameters: [
          {
            name: "q",
            in: "query",
            schema: { type: "string", minLength: 2 },
            description: "Nome parcial, case-insensitive e normalizado",
          },
          {
            name: "documento",
            in: "query",
            schema: { type: "string" },
            description: "Documento normalizado no servidor",
          },
        ],
        response: {
          type: "object",
          properties: { data: { type: "array", items: ref("PessoaListItem") } },
        },
      }),
      post: operation("Cadastrar pessoa", "BENEFICIARIO_CADASTRAR", {
        status: 201,
        request: ref("PessoaCreate"),
      }),
    },
    "/api/v1/pessoas/{id}": path(
      "get",
      "Detalhar pessoa",
      "BENEFICIARIO_VISUALIZAR",
      { parameters: [id] },
    ),
    "/api/v1/grupos-distribuicao": path(
      "get",
      "Listar grupos ativos",
      "BENEFICIARIO_VISUALIZAR",
      {
        response: {
          type: "object",
          properties: { data: { type: "array", items: ref("Grupo") } },
        },
      },
    ),
    "/api/v1/motivos-desligamento": path(
      "get",
      "Listar motivos ativos",
      "BENEFICIARIO_VISUALIZAR",
      {
        response: {
          type: "object",
          properties: { data: { type: "array", items: ref("Motivo") } },
        },
      },
    ),
    "/api/v1/capacidade": {
      get: operation("Obter capacidade", "BENEFICIARIO_VISUALIZAR"),
      put: operation("Alterar capacidade", "CAPACIDADE_ALTERAR", {
        status: 200,
        request: { type: "object", additionalProperties: true },
      }),
    },
    "/api/v1/beneficiarios": {
      get: operation("Buscar beneficiários", "BENEFICIARIO_VISUALIZAR"),
      post: operation("Admitir beneficiário", "BENEFICIARIO_ADMITIR", {
        status: 201,
        request: { type: "object", additionalProperties: true },
      }),
    },
    "/api/v1/beneficiarios/{id}": path(
      "get",
      "Detalhe operacional do beneficiário",
      "BENEFICIARIO_VISUALIZAR",
      {
        parameters: [id],
        response: {
          type: "object",
          properties: { data: ref("BeneficiarioDetail") },
        },
      },
    ),
    "/api/v1/beneficiarios/{id}/desligar": mutation(
      "Desligar beneficiário",
      "BENEFICIARIO_DESLIGAR",
    ),
    "/api/v1/beneficiarios/{id}/reativar": mutation(
      "Reativar beneficiário",
      "BENEFICIARIO_REATIVAR",
    ),
    "/api/v1/beneficiarios/{id}/alterar-grupo": mutation(
      "Alterar grupo",
      "BENEFICIARIO_EDITAR",
    ),
    "/api/v1/beneficiarios/{id}/historico": path(
      "get",
      "Histórico assistencial",
      "BENEFICIARIO_VISUALIZAR",
      { parameters: [id] },
    ),
    "/api/v1/candidaturas": {
      get: operation(
        "Listar candidaturas com documentos mascarados",
        "CANDIDATURA_VISUALIZAR",
        {
          parameters: [
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "nome", in: "query", schema: { type: "string" } },
            { name: "documento", in: "query", schema: { type: "string" } },
          ],
          description: "Inclui ultimaTentativaContato em uma única consulta.",
        },
      ),
      post: operation("Criar candidatura", "CANDIDATURA_CADASTRAR", {
        status: 201,
        request: {
          type: "object",
          required: ["pessoaId"],
          properties: { pessoaId: { type: "string" } },
        },
      }),
    },
    "/api/v1/candidaturas/{id}/priorizar": mutation(
      "Priorizar candidatura",
      "CANDIDATURA_PRIORIZAR",
    ),
    "/api/v1/candidaturas/{id}/tentativas-contato": mutation(
      "Registrar tentativa de contato",
      "CANDIDATURA_CADASTRAR",
      [id],
      {
        type: "object",
        required: ["resultado"],
        properties: {
          resultado: {
            type: "string",
            description: "Texto livre confirmado no schema",
          },
          observacao: { type: ["string", "null"] },
        },
      },
    ),
    "/api/v1/candidaturas/{id}/nao-localizado": mutation(
      "Marcar não localizado",
      "CANDIDATURA_CADASTRAR",
    ),
    "/api/v1/candidaturas/{id}/admitir": mutation(
      "Admitir candidatura",
      "CANDIDATURA_ADMITIR",
      [id],
      { type: "object", additionalProperties: true },
      201,
    ),
    "/api/v1/competencias": path(
      "get",
      "Listar competências",
      "BENEFICIARIO_VISUALIZAR",
    ),
    "/api/v1/competencias/{id}": path(
      "get",
      "Detalhar competência",
      "BENEFICIARIO_VISUALIZAR",
      { parameters: [id] },
    ),
    "/api/v1/competencias/gerar": mutation(
      "Gerar competência",
      "DISTRIBUICAO_ABRIR",
      [],
      { type: "object", additionalProperties: true },
      201,
    ),
    "/api/v1/distribuicoes": path(
      "get",
      "Listar distribuições",
      "BENEFICIARIO_VISUALIZAR",
    ),
    "/api/v1/distribuicoes/{id}": path(
      "get",
      "Detalhar distribuição",
      "BENEFICIARIO_VISUALIZAR",
      { parameters: [id] },
    ),
    "/api/v1/distribuicoes/{id}/abrir": mutation(
      "Abrir distribuição",
      "DISTRIBUICAO_ABRIR",
    ),
    "/api/v1/distribuicoes/{id}/encerrar": mutation(
      "Encerrar distribuição",
      "DISTRIBUICAO_ENCERRAR",
    ),
    "/api/v1/distribuicoes/{id}/remarcar": mutation(
      "Remarcar distribuição",
      "DISTRIBUICAO_REMARCAR",
    ),
    "/api/v1/distribuicoes/{id}/check-ins": {
      get: operation("Listar check-ins", "DISTRIBUICAO_TRIAGEM", {
        parameters: [id],
      }),
      post: operation("Registrar check-in", "DISTRIBUICAO_TRIAGEM", {
        status: 201,
        parameters: [id],
        request: { type: "object", additionalProperties: true },
      }),
    },
    "/api/v1/distribuicoes/{id}/retiradas": {
      get: operation("Listar retiradas", "RETIRADA_REGISTRAR", {
        parameters: [id],
      }),
      post: operation("Registrar retirada", "RETIRADA_REGISTRAR", {
        status: 201,
        parameters: [id],
        request: { type: "object", additionalProperties: true },
      }),
    },
    "/api/v1/distribuicoes/{id}/liberacoes-cestas": {
      get: operation("Listar liberações", "ESTOQUE_VISUALIZAR", {
        parameters: [id],
      }),
      post: operation("Liberar cestas", "CESTA_LIBERAR_DISTRIBUICAO", {
        status: 201,
        parameters: [id],
        request: { type: "object", additionalProperties: true },
      }),
    },
    "/api/v1/distribuicoes/{id}/historico": path(
      "get",
      "Histórico da distribuição",
      "BENEFICIARIO_VISUALIZAR",
      { parameters: [id] },
    ),
    "/api/v1/ausencias/{id}/justificativas": mutation(
      "Registrar justificativa",
      "JUSTIFICATIVA_REGISTRAR",
    ),
    "/api/v1/justificativas/{id}/avaliar": mutation(
      "Avaliar justificativa",
      "JUSTIFICATIVA_AVALIAR",
    ),
    "/api/v1/retiradas/{id}": path(
      "get",
      "Detalhar retirada mascarada",
      "RETIRADA_REGISTRAR",
      { parameters: [id] },
    ),
    "/api/v1/retiradas/{id}/estornar": mutation(
      "Estornar retirada",
      "RETIRADA_ESTORNAR_PROPRIA ou RETIRADA_ESTORNAR_QUALQUER",
    ),
    "/api/v1/estoque/categorias-prioridade": path(
      "get",
      "Listar categorias",
      "ESTOQUE_VISUALIZAR",
    ),
    "/api/v1/estoque/insumos": {
      get: operation("Listar insumos", "ESTOQUE_VISUALIZAR"),
      post: operation("Cadastrar insumo", "ESTOQUE_INSUMO_CADASTRAR", {
        status: 201,
        request: { type: "object", additionalProperties: true },
      }),
    },
    "/api/v1/estoque/insumos/{id}": path(
      "get",
      "Detalhar insumo",
      "ESTOQUE_VISUALIZAR",
      { parameters: [id] },
    ),
    "/api/v1/estoque/entradas": mutation(
      "Registrar entrada",
      "ESTOQUE_ENTRADA",
      [],
      { type: "object", additionalProperties: true },
      201,
    ),
    "/api/v1/estoque/perdas": mutation(
      "Registrar perda",
      "ESTOQUE_PERDA",
      [],
      { type: "object", additionalProperties: true },
      201,
    ),
    "/api/v1/estoque/inventarios": mutation(
      "Criar inventário",
      "ESTOQUE_INVENTARIO",
      [],
      { type: "object", additionalProperties: true },
      201,
    ),
    "/api/v1/estoque/inventarios/{id}": path(
      "get",
      "Detalhar inventário",
      "ESTOQUE_INVENTARIO",
      { parameters: [id] },
    ),
    "/api/v1/estoque/inventarios/{id}/itens/{apresentacaoId}": path(
      "put",
      "Informar item do inventário",
      "ESTOQUE_INVENTARIO",
      {
        parameters: [id, presentationId],
        request: { type: "object", additionalProperties: true },
      },
    ),
    "/api/v1/estoque/inventarios/{id}/concluir": mutation(
      "Concluir inventário",
      "ESTOQUE_INVENTARIO",
    ),
    "/api/v1/estoque/lotes-montagem": {
      get: operation("Listar lotes", "ESTOQUE_VISUALIZAR"),
      post: operation("Montar cestas", "CESTA_MONTAR", {
        status: 201,
        request: { type: "object", additionalProperties: true },
      }),
    },
    "/api/v1/estoque/lotes-montagem/{id}": path(
      "get",
      "Detalhar lote",
      "ESTOQUE_VISUALIZAR",
      { parameters: [id] },
    ),
    "/api/v1/estoque/lotes-montagem/{id}/desmontar": mutation(
      "Desmontar cestas",
      "CESTA_DESMONTAR",
    ),
    "/api/v1/estoque/lotes-montagem/{id}/ajustes": mutation(
      "Ajustar lote",
      "CESTA_AJUSTAR_LOTE",
    ),
    "/api/v1/doadores": {
      get: operation("Listar doadores", "ESTOQUE_VISUALIZAR"),
      post: operation("Criar doador", "ESTOQUE_ENTRADA", {
        status: 201,
        request: { type: "object", additionalProperties: true },
      }),
    },
    "/api/v1/doadores/{id}": path(
      "put",
      "Atualizar doador",
      "ESTOQUE_ENTRADA",
      {
        parameters: [id],
        request: { type: "object", additionalProperties: true },
      },
    ),
    "/api/v1/cestas/modelos": {
      get: operation("Listar modelos", "CESTA_MODELO_GERENCIAR"),
      post: operation("Criar modelo", "CESTA_MODELO_GERENCIAR", {
        status: 201,
        request: { type: "object", additionalProperties: true },
      }),
    },
    "/api/v1/cestas/modelos/{id}": path(
      "get",
      "Detalhar modelo",
      "CESTA_MODELO_GERENCIAR",
      { parameters: [id] },
    ),
    "/api/v1/cestas/modelos/{id}/versoes": mutation(
      "Criar versão de modelo",
      "CESTA_MODELO_GERENCIAR",
      [id],
      { type: "object", additionalProperties: true },
      201,
    ),
    "/api/v1/planejamentos/simular": mutation(
      "Simular planejamento",
      "ESTOQUE_VISUALIZAR",
      [],
      { type: "object", additionalProperties: true },
      201,
    ),
    "/api/v1/planejamentos": {
      get: operation("Listar planejamentos", "ESTOQUE_VISUALIZAR"),
      post: operation("Criar planejamento", "CESTA_PLANEJAMENTO_APROVAR", {
        status: 201,
        request: { type: "object", additionalProperties: true },
      }),
    },
    "/api/v1/planejamentos/{id}": path(
      "get",
      "Detalhar planejamento",
      "ESTOQUE_VISUALIZAR",
      { parameters: [id] },
    ),
    "/api/v1/planejamentos/{id}/aprovar": mutation(
      "Aprovar planejamento",
      "CESTA_PLANEJAMENTO_APROVAR",
    ),
    "/api/v1/planejamentos/{id}/revisoes": mutation(
      "Revisar planejamento",
      "CESTA_PLANEJAMENTO_APROVAR",
      [id],
      { type: "object", additionalProperties: true },
      201,
    ),
    "/api/v1/dashboard": path(
      "get",
      "Dashboard operacional",
      "BENEFICIARIO_VISUALIZAR e ESTOQUE_VISUALIZAR",
    ),
    "/api/v1/relatorios/distribuicoes": path(
      "get",
      "Relatório de distribuições",
      "BENEFICIARIO_VISUALIZAR",
    ),
    "/api/v1/relatorios/beneficiarios": path(
      "get",
      "Relatório de beneficiários",
      "BENEFICIARIO_VISUALIZAR",
    ),
    "/api/v1/relatorios/estoque": path(
      "get",
      "Relatório de estoque",
      "ESTOQUE_VISUALIZAR",
    ),
    "/api/v1/auditoria": path(
      "get",
      "Listar auditoria sanitizada",
      "AUDITORIA_VISUALIZAR",
    ),
    "/api/v1/auditoria/{id}": path(
      "get",
      "Detalhar auditoria sanitizada",
      "AUDITORIA_VISUALIZAR",
      { parameters: [id] },
    ),
    "/api/v1/admin/status": path(
      "get",
      "Status administrativo",
      "PERFIL_GERENCIAR",
    ),
  },
} as const;
