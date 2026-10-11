import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import pg from "pg";

// Conta de demonstração pública (portfólio): somente leitura.
// A senha fica visível para qualquer visitante, por isso o perfil DEMO
// recebe apenas permissões de visualização e não pode alterar a senha
// (ver AlterarSenhaUseCase). Use apenas em bancos com dados fictícios.
const PERFIL = { codigo: "DEMO", nome: "Demonstração" };
const LOGIN = process.env.DEMO_LOGIN ?? "demo";
const PERMISSOES = ["BENEFICIARIO_VISUALIZAR", "CANDIDATURA_VISUALIZAR", "ESTOQUE_VISUALIZAR"];

// DEMO_PASSWORD permite fixar uma senha fácil de divulgar; sem ela, gera uma aleatória.
const senha = process.env.DEMO_PASSWORD ?? randomBytes(9).toString("base64url");
if (senha.length < 8) {
  console.error("DEMO_PASSWORD deve ter pelo menos 8 caracteres.");
  process.exit(1);
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

const client = await pool.connect();
try {
  await client.query("BEGIN");

  const existentes = await client.query("SELECT codigo FROM permissoes WHERE codigo = ANY($1)", [PERMISSOES]);
  const faltando = PERMISSOES.filter((p) => !existentes.rows.some((r) => r.codigo === p));
  if (faltando.length) {
    throw new Error(`Permissões ausentes (rode antes npm run users:seed): ${faltando.join(", ")}`);
  }

  const perfil = await client.query(
    `INSERT INTO perfis(codigo,nome,ativo) VALUES($1,$2,true)
     ON CONFLICT (codigo) DO UPDATE SET nome=EXCLUDED.nome, ativo=true
     RETURNING id`,
    [PERFIL.codigo, PERFIL.nome],
  );
  const perfilId = perfil.rows[0].id;

  // Recria as permissões do perfil para garantir que continue somente leitura.
  await client.query("DELETE FROM perfis_permissoes WHERE perfil_id=$1", [perfilId]);
  await client.query(
    `INSERT INTO perfis_permissoes(perfil_id,permissao_id)
     SELECT $1,id FROM permissoes WHERE codigo = ANY($2)`,
    [perfilId, PERMISSOES],
  );

  const hash = await bcrypt.hash(senha, 12);
  const usuario = await client.query(
    `INSERT INTO usuarios(login,senha_hash,ativo) VALUES($1,$2,true)
     ON CONFLICT (login) DO UPDATE SET senha_hash=EXCLUDED.senha_hash, ativo=true
     RETURNING id`,
    [LOGIN, hash],
  );
  const usuarioId = usuario.rows[0].id;

  // O usuário demo tem apenas o perfil DEMO, nunca outros perfis acumulados.
  await client.query("DELETE FROM usuarios_perfis WHERE usuario_id=$1", [usuarioId]);
  await client.query("INSERT INTO usuarios_perfis(usuario_id,perfil_id) VALUES($1,$2)", [usuarioId, perfilId]);

  await client.query("COMMIT");

  console.log("Conta de demonstração pronta (somente leitura):\n");
  console.log(`  login=${LOGIN}`);
  console.log(`  senha=${senha}`);
  console.log(`  permissões=${PERMISSOES.join(", ")}`);
  if (!process.env.DEMO_PASSWORD) {
    console.log("\nAnote a senha agora: ela não é recuperável depois (apenas o hash é salvo).");
  }
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
