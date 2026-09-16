import type { Pool } from "pg";
import type { AdminStatusPort } from "../../application/admin/ports/admin-status.port.js";
export class PostgresAdminStatus implements AdminStatusPort {
  constructor(private readonly pool: Pool) {}
  async obter() {
    let database = "ok";
    try {
      await this.pool.query("SELECT 1");
    } catch {
      database = "unavailable";
    }
    const memory = process.memoryUsage();
    return {
      database: {
        status: database,
        pool: {
          total: this.pool.totalCount,
          idle: this.pool.idleCount,
          waiting: this.pool.waitingCount,
        },
      },
      process: {
        uptimeSeconds: Math.floor(process.uptime()),
        memory: {
          rssBytes: memory.rss,
          heapTotalBytes: memory.heapTotal,
          heapUsedBytes: memory.heapUsed,
          externalBytes: memory.external,
        },
      },
    };
  }
}
