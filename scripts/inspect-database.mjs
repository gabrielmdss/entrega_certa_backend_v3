import 'dotenv/config';
import pg from 'pg';
import { writeFile } from 'node:fs/promises';

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 5000),
});

const queries = {
  database: `SELECT current_database() AS database, current_user AS db_user,
    current_setting('server_version') AS version`,
  relations: `SELECT c.relkind, c.relname AS name, obj_description(c.oid) AS comment
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'pastoral' AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
    ORDER BY c.relkind, c.relname`,
  columns: `SELECT table_name, column_name, ordinal_position, data_type, udt_name,
    is_nullable, column_default
    FROM information_schema.columns WHERE table_schema = 'pastoral'
    ORDER BY table_name, ordinal_position`,
  constraints: `SELECT con.conname AS name, cl.relname AS table_name, con.contype AS type,
    pg_get_constraintdef(con.oid, true) AS definition
    FROM pg_constraint con JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace WHERE n.nspname = 'pastoral'
    ORDER BY cl.relname, con.conname`,
  indexes: `SELECT tablename, indexname, indexdef FROM pg_indexes
    WHERE schemaname = 'pastoral' ORDER BY tablename, indexname`,
  triggers: `SELECT event_object_table AS table_name, trigger_name,
    event_manipulation AS event, action_timing AS timing, action_statement
    FROM information_schema.triggers WHERE trigger_schema = 'pastoral'
    ORDER BY event_object_table, trigger_name, event_manipulation`,
  routines: `SELECT p.proname AS name, pg_get_function_identity_arguments(p.oid) AS arguments,
    pg_get_function_result(p.oid) AS result, l.lanname AS language, p.prokind AS kind,
    pg_get_functiondef(p.oid) AS definition,
    EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e') AS extension_owned
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'pastoral' ORDER BY p.proname, arguments`,
  enums: `SELECT t.typname AS name, e.enumsortorder, e.enumlabel AS value
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    JOIN pg_enum e ON e.enumtypid = t.oid WHERE n.nspname = 'pastoral'
    ORDER BY t.typname, e.enumsortorder`,
  beneficiary: `SELECT * FROM pastoral.beneficiarios LIMIT 1`,
};

const output = {};
try {
  for (const [name, query] of Object.entries(queries)) {
    output[name] = (await pool.query(query)).rows;
  }
  if (process.argv.includes('--markdown')) {
    const targetIndex = process.argv.indexOf('--markdown') + 1;
    const target = process.argv[targetIndex];
    if (!target) throw new Error('Informe o caminho após --markdown');
    const md = renderMarkdown(output);
    await writeFile(target, md, 'utf8');
    process.stdout.write(`Mapeamento gravado em ${target}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  }
} finally {
  await pool.end();
}

function renderMarkdown(data) {
  const relations = data.relations;
  const tables = relations.filter((item) => ['r', 'p'].includes(item.relkind));
  const views = relations.filter((item) => ['v', 'm'].includes(item.relkind));
  const sequences = relations.filter((item) => item.relkind === 'S');
  const routines = data.routines;
  const appRoutines = routines.filter((item) => !item.extension_owned);
  const extensionRoutines = routines.filter((item) => item.extension_owned);
  const grouped = (rows, key) => Map.groupBy(rows, (row) => row[key]);
  const columnsByTable = grouped(data.columns, 'table_name');
  const constraintsByTable = grouped(data.constraints, 'table_name');
  const indexesByTable = grouped(data.indexes, 'tablename');
  const lines = [
    '# Mapeamento do banco PostgreSQL', '',
    `Gerado por inspeção somente leitura do schema \`pastoral\` em ${new Date().toISOString()}.`,
    'Credenciais e endereço do servidor foram deliberadamente omitidos.', '',
    '## Resumo', '',
    `- PostgreSQL: ${data.database[0].version}`,
    `- Tabelas: ${tables.length}`,
    `- Views: ${views.length}`,
    `- Sequences: ${sequences.length}`,
    `- Constraints: ${data.constraints.length}`,
    `- Índices: ${data.indexes.length}`,
    `- Triggers/eventos: ${data.triggers.length}`,
    `- Funções próprias: ${appRoutines.length}`,
    `- Funções fornecidas por extensões no schema: ${extensionRoutines.length}`,
    `- Enums PostgreSQL: ${data.enums.length === 0 ? 'nenhum; estados são protegidos por CHECKs/varchar' : data.enums.length}`, '',
    '## Tabelas, colunas, chaves e índices', '',
  ];
  for (const table of tables) {
    lines.push(`### \`pastoral.${table.name}\``, '', '| Coluna | Tipo | Nulo | Default |', '|---|---|---:|---|');
    for (const col of columnsByTable.get(table.name) ?? []) {
      const type = col.data_type === 'USER-DEFINED' ? col.udt_name : col.data_type;
      lines.push(`| \`${col.column_name}\` | \`${type}\` | ${col.is_nullable} | ${escapeCell(col.column_default ?? '')} |`);
    }
    lines.push('', '**Constraints**', '');
    for (const con of constraintsByTable.get(table.name) ?? []) lines.push(`- \`${con.name}\`: ${con.definition}`);
    lines.push('', '**Índices**', '');
    for (const idx of indexesByTable.get(table.name) ?? []) lines.push(`- \`${idx.indexname}\`: ${idx.indexdef}`);
    lines.push('');
  }
  lines.push('## Views', '');
  for (const view of views) lines.push(`- \`pastoral.${view.name}\``);
  lines.push('', '## Triggers', '');
  for (const trigger of data.triggers) lines.push(`- \`${trigger.trigger_name}\` em \`pastoral.${trigger.table_name}\`: ${trigger.timing} ${trigger.event} — ${trigger.action_statement}`);
  lines.push('', '## Sequences', '');
  for (const sequence of sequences) lines.push(`- \`pastoral.${sequence.name}\``);
  lines.push('', '## Funções próprias e assinaturas', '');
  for (const routine of appRoutines) lines.push(`- \`pastoral.${routine.name}(${routine.arguments}) → ${routine.result}\` (${routine.language})`);
  lines.push('', '## Funções de extensões', '',
    `Foram encontradas ${extensionRoutines.length} funções pertencentes a extensões (por exemplo, pgcrypto/pg_trgm). ` +
    'Elas não são regras de negócio da aplicação e não são reproduzidas individualmente neste documento.', '',
    '## Tipos enumerados', '');
  if (data.enums.length === 0) lines.push('- Nenhum enum nativo no schema.');
  else for (const value of data.enums) lines.push(`- \`${value.name}\`: \`${value.value}\``);
  lines.push('', '## Observações de integração', '',
    '- O schema real usa `pastoral.beneficiarios` com IDs `bigint`; a API os mantém como strings na fronteira HTTP.',
    '- O status de beneficiário é `varchar` protegido por constraint, não enum PostgreSQL.',
    '- Datas civis (`date`) devem permanecer strings `YYYY-MM-DD`; timestamps são `timestamptz`.',
    '- Funções transacionais próprias devem ser chamadas com o schema explicitamente qualificado.',
    '- A inspeção não executou DDL nem alterou dados.', '');
  return `${lines.join('\n')}\n`;
}

function escapeCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}
