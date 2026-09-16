import { Pool, type PoolClient } from "pg";

export function testPool() {
  const name = process.env.PASTORAL_TEST_DATABASE;
  if (
    !name ||
    !/^pastoral_test_[a-f0-9]{32}$/.test(name) ||
    process.env.DB_NAME !== name
  )
    throw new Error(
      "Integração requer banco temporário criado pelo global setup",
    );
  return new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: name,
    options:
      "-c search_path=pastoral,public -c lock_timeout=5000 -c statement_timeout=10000",
    max: 10,
  });
}

export async function reset(db: Pool) {
  const current = (
    await db.query<{ name: string }>("SELECT current_database() name")
  ).rows[0]?.name;
  if (
    !current ||
    current !== process.env.PASTORAL_TEST_DATABASE ||
    !/^pastoral_test_[a-f0-9]{32}$/.test(current)
  )
    throw new Error("Recusado cleanup fora do banco criado pela suíte");
  const tables = (
    await db.query<{ name: string }>(
      "SELECT quote_ident(tablename) name FROM pg_tables WHERE schemaname='pastoral'",
    )
  ).rows;
  await db.query(
    `TRUNCATE ${tables.map((t) => `pastoral.${t.name}`).join(",")} RESTART IDENTITY CASCADE`,
  );
}

/** Hold the real lock until independent connections are visibly waiting. */
export async function race<T>(
  db: Pool,
  lockSql: string,
  operations: Array<() => Promise<T>>,
) {
  const blocker = await db.connect();
  try {
    await blocker.query("BEGIN");
    await blocker.query(lockSql);
    const pid = (
      await blocker.query<{ pid: number }>("SELECT pg_backend_pid() pid")
    ).rows[0]?.pid;
    const pending = operations.map((op) => op());
    const settled = Promise.allSettled(pending);
    const deadline = Date.now() + 4000;
    let waiting = false;
    while (Date.now() < deadline) {
      const count =
        (
          await db.query<{ n: number }>(
            "SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND pid<>$1 AND wait_event_type='Lock'",
            [pid],
          )
        ).rows[0]?.n ?? 0;
      if (count >= operations.length) {
        waiting = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await blocker.query("COMMIT");
    const results = await settled;
    if (!waiting)
      throw new Error("As operações não disputaram o lock esperado");
    return results;
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
  }
}

export async function sqlTransaction(
  db: Pool,
  operation: (client: PoolClient) => Promise<void>,
) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await operation(c);
    await c.query("COMMIT");
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
}
