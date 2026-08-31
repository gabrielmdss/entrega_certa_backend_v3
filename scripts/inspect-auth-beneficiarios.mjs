import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcrypt';

const pool = new pg.Pool({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT), database: process.env.DB_NAME,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 5000),
});

const queries = {
  columns: `SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns WHERE table_schema='pastoral'
    AND table_name IN ('usuarios','perfis','permissoes','usuarios_perfis','perfis_permissoes',
      'configuracoes_capacidade','beneficiarios','beneficiarios_desligamentos',
      'beneficiarios_grupos_historico','pessoas','grupos_distribuicao','motivos_desligamento')
    ORDER BY table_name, ordinal_position`,
  users: `SELECT id::text, login, ativo, pessoa_id::text,
    CASE WHEN senha_hash LIKE '$2%' THEN 'bcrypt' WHEN senha_hash LIKE '$argon2%' THEN 'argon2' ELSE 'outro' END hash_type
    FROM pastoral.usuarios ORDER BY id`,
  roles: `SELECT id::text, codigo, nome, ativo FROM pastoral.perfis ORDER BY id`,
  permissions: `SELECT id::text, codigo, descricao FROM pastoral.permissoes ORDER BY codigo`,
  grants: `SELECT u.login, p.codigo perfil, array_agg(DISTINCT pe.codigo ORDER BY pe.codigo) permissoes
    FROM pastoral.usuarios u LEFT JOIN pastoral.usuarios_perfis up ON up.usuario_id=u.id
    LEFT JOIN pastoral.perfis p ON p.id=up.perfil_id LEFT JOIN pastoral.perfis_permissoes pp ON pp.perfil_id=p.id
    LEFT JOIN pastoral.permissoes pe ON pe.id=pp.permissao_id GROUP BY u.login,p.codigo ORDER BY u.login,p.codigo`,
  capacity: `SELECT * FROM pastoral.vw_capacidade_atual`,
  groups: `SELECT * FROM pastoral.grupos_distribuicao ORDER BY id`,
  reasons: `SELECT * FROM pastoral.motivos_desligamento ORDER BY id`,
  functions: `SELECT p.proname name, pg_get_function_identity_arguments(p.oid) arguments,
    pg_get_function_result(p.oid) result, pg_get_functiondef(p.oid) definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='pastoral' AND NOT EXISTS
      (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e')
    ORDER BY p.proname`,
  view: `SELECT pg_get_viewdef('pastoral.vw_capacidade_atual'::regclass, true) definition`,
};

try {
  const result = {};
  for (const [key, sql] of Object.entries(queries)) result[key] = (await pool.query(sql)).rows;
  if (process.env.SEED_PASSWORD_CANDIDATE) {
    const hash=(await pool.query("SELECT senha_hash FROM pastoral.usuarios WHERE login='admin'")).rows[0]?.senha_hash;
    result.seedPasswordMatchesAdmin=typeof hash==='string'&&await bcrypt.compare(process.env.SEED_PASSWORD_CANDIDATE,hash);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally { await pool.end(); }
