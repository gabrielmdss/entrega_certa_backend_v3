import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import pg from "pg";

// Códigos extraídos de docs/route-access-matrix.md.
const PERMISSOES = [
  ["BENEFICIARIO_VISUALIZAR", "Visualizar beneficiários"],
  ["BENEFICIARIO_CADASTRAR", "Cadastrar beneficiários"],
  ["BENEFICIARIO_ADMITIR", "Admitir beneficiários"],
  ["BENEFICIARIO_DESLIGAR", "Desligar beneficiários"],
  ["BENEFICIARIO_REATIVAR", "Reativar beneficiários"],
  ["BENEFICIARIO_EDITAR", "Editar beneficiários"],
  ["CAPACIDADE_ALTERAR", "Alterar capacidade de atendimento"],
  ["CANDIDATURA_VISUALIZAR", "Visualizar candidaturas"],
  ["CANDIDATURA_CADASTRAR", "Cadastrar candidaturas"],
  ["CANDIDATURA_PRIORIZAR", "Priorizar candidaturas"],
  ["CANDIDATURA_ADMITIR", "Admitir candidaturas"],
  ["DISTRIBUICAO_ABRIR", "Abrir distribuições"],
  ["DISTRIBUICAO_ENCERRAR", "Encerrar distribuições"],
  ["DISTRIBUICAO_REMARCAR", "Remarcar distribuições"],
  ["DISTRIBUICAO_TRIAGEM", "Registrar triagem/check-in"],
  ["RETIRADA_REGISTRAR", "Registrar retiradas"],
  ["RETIRADA_ESTORNAR_PROPRIA", "Estornar retirada própria"],
  ["RETIRADA_ESTORNAR_QUALQUER", "Estornar qualquer retirada"],
  ["CESTA_ADICIONAL_AUTORIZAR", "Autorizar cesta adicional"],
  ["CESTA_LIBERAR_DISTRIBUICAO", "Liberar cestas para distribuição"],
  ["JUSTIFICATIVA_REGISTRAR", "Registrar justificativa de ausência"],
  ["JUSTIFICATIVA_AVALIAR", "Avaliar justificativa de ausência"],
  ["ESTOQUE_VISUALIZAR", "Visualizar estoque"],
  ["ESTOQUE_INSUMO_CADASTRAR", "Cadastrar insumos"],
  ["ESTOQUE_ENTRADA", "Registrar entrada de estoque"],
  ["ESTOQUE_PERDA", "Registrar perda de estoque"],
  ["ESTOQUE_INVENTARIO", "Conduzir inventário"],
  ["CESTA_MONTAR", "Montar lotes de cestas"],
  ["CESTA_DESMONTAR", "Desmontar lotes de cestas"],
  ["CESTA_AJUSTAR_LOTE", "Ajustar composição de lote"],
  ["CESTA_MODELO_GERENCIAR", "Gerenciar modelos de cesta"],
  ["CESTA_PLANEJAMENTO_APROVAR", "Aprovar planejamento de cestas"],
  ["AUDITORIA_VISUALIZAR", "Visualizar auditoria"],
  ["PERFIL_GERENCIAR", "Gerenciar perfis e permissões"],
];

const ATENDIMENTO = [
  "BENEFICIARIO_VISUALIZAR",
  "BENEFICIARIO_CADASTRAR",
  "BENEFICIARIO_ADMITIR",
  "BENEFICIARIO_DESLIGAR",
  "BENEFICIARIO_REATIVAR",
  "BENEFICIARIO_EDITAR",
  "CAPACIDADE_ALTERAR",
  "CANDIDATURA_VISUALIZAR",
  "CANDIDATURA_CADASTRAR",
  "CANDIDATURA_PRIORIZAR",
  "CANDIDATURA_ADMITIR",
  "DISTRIBUICAO_ABRIR",
  "DISTRIBUICAO_ENCERRAR",
  "DISTRIBUICAO_REMARCAR",
  "DISTRIBUICAO_TRIAGEM",
  "RETIRADA_REGISTRAR",
  "RETIRADA_ESTORNAR_PROPRIA",
  "CESTA_ADICIONAL_AUTORIZAR",
  "JUSTIFICATIVA_REGISTRAR",
  "JUSTIFICATIVA_AVALIAR",
];

const ESTOQUE = [
  "ESTOQUE_VISUALIZAR",
  "ESTOQUE_INSUMO_CADASTRAR",
  "ESTOQUE_ENTRADA",
  "ESTOQUE_PERDA",
  "ESTOQUE_INVENTARIO",
  "CESTA_MONTAR",
  "CESTA_DESMONTAR",
  "CESTA_AJUSTAR_LOTE",
  "CESTA_MODELO_GERENCIAR",
  "CESTA_PLANEJAMENTO_APROVAR",
  "CESTA_LIBERAR_DISTRIBUICAO",
];

const RESPONSAVEL = [
  "BENEFICIARIO_VISUALIZAR",
  "BENEFICIARIO_CADASTRAR",
  "BENEFICIARIO_EDITAR",
  "CANDIDATURA_VISUALIZAR",
  "CANDIDATURA_CADASTRAR",
  "DISTRIBUICAO_TRIAGEM",
  "RETIRADA_REGISTRAR",
  "RETIRADA_ESTORNAR_PROPRIA",
  "CESTA_ADICIONAL_AUTORIZAR",
  "JUSTIFICATIVA_REGISTRAR",
];

// Um usuário por perfil/função. Ajuste login/perfis conforme a necessidade real.
const PERFIS = [
  {
    codigo: "ADMINISTRADOR",
    nome: "Administrador",
    login: "admin",
    permissoes: PERMISSOES.map(([codigo]) => codigo),
  },
  { codigo: "ATENDIMENTO", nome: "Atendimento", login: "atendimento", permissoes: ATENDIMENTO },
  { codigo: "ESTOQUE", nome: "Estoque", login: "estoque", permissoes: ESTOQUE },
  { codigo: "RESPONSAVEL", nome: "Responsável", login: "responsavel", permissoes: RESPONSAVEL },
];

function gerarSenha() {
  return randomBytes(9).toString("base64url");
}

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  options: `-c search_path=${process.env.DB_SCHEMA ?? "pastoral"},public`,
});

const credenciais = [];
try {
  for (const [codigo, descricao] of PERMISSOES) {
    await pool.query(
      `INSERT INTO permissoes(codigo,descricao) VALUES($1,$2)
       ON CONFLICT (codigo) DO UPDATE SET descricao=EXCLUDED.descricao`,
      [codigo, descricao],
    );
  }

  for (const perfil of PERFIS) {
    const r = await pool.query(
      `INSERT INTO perfis(codigo,nome,ativo) VALUES($1,$2,true)
       ON CONFLICT (codigo) DO UPDATE SET nome=EXCLUDED.nome, ativo=true
       RETURNING id`,
      [perfil.codigo, perfil.nome],
    );
    const perfilId = r.rows[0].id;
    await pool.query("DELETE FROM perfis_permissoes WHERE perfil_id=$1", [perfilId]);
    for (const codigoPermissao of perfil.permissoes) {
      await pool.query(
        `INSERT INTO perfis_permissoes(perfil_id,permissao_id)
         SELECT $1,id FROM permissoes WHERE codigo=$2`,
        [perfilId, codigoPermissao],
      );
    }

    const senha = gerarSenha();
    const hash = await bcrypt.hash(senha, 12);
    const u = await pool.query(
      `INSERT INTO usuarios(login,senha_hash,ativo) VALUES($1,$2,true)
       ON CONFLICT (login) DO UPDATE SET senha_hash=EXCLUDED.senha_hash, ativo=true
       RETURNING id`,
      [perfil.login, hash],
    );
    const usuarioId = u.rows[0].id;
    await pool.query(
      `INSERT INTO usuarios_perfis(usuario_id,perfil_id) VALUES($1,$2)
       ON CONFLICT DO NOTHING`,
      [usuarioId, perfilId],
    );
    credenciais.push({ login: perfil.login, perfil: perfil.nome, senha });
  }

  console.log("Usuários criados/atualizados:\n");
  for (const c of credenciais)
    console.log(`  ${c.perfil.padEnd(14)} login=${c.login.padEnd(14)} senha=${c.senha}`);
  console.log("\nAnote as senhas agora: elas não são recuperáveis depois (apenas o hash é salvo).");
} finally {
  await pool.end();
}
