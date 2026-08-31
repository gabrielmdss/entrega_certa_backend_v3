import { Pool } from "pg";
import type { DatabaseConfig } from "../../../../main/config.js";
import type { Logger } from "pino";

export function createPostgresPool(config: DatabaseConfig): Pool {
  return new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    max: config.poolMax,
    connectionTimeoutMillis: config.connectionTimeoutMs,
    idleTimeoutMillis: config.idleTimeoutMs,
    statement_timeout: config.statementTimeoutMs,
    options: `-c lock_timeout=${config.lockTimeoutMs}`,
    application_name: "pastoral-api",
  });
}

export function observePostgresQueries(
  pool: Pool,
  logger: Logger,
  slowQueryMs: number,
): void {
  pool.on("connect", (client) => {
    const target = client as unknown as {
      query: (...args: unknown[]) => unknown;
    };
    const original = target.query.bind(client);
    target.query = (...args: unknown[]) => {
      const started = performance.now();
      const result = original(...args);
      if (result && typeof result === "object" && "then" in result) {
        return Promise.resolve(result).finally(() => {
          const durationMs = Math.round(performance.now() - started);
          if (durationMs >= slowQueryMs)
            logger.warn(
              { durationMs, thresholdMs: slowQueryMs },
              "Slow PostgreSQL query",
            );
        });
      }
      return result;
    };
  });
}
