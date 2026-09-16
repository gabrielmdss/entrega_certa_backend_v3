import { describe, expect, it, vi } from "vitest";
import { ObterStatusAdministrativoUseCase } from "../../../src/application/admin/use-cases/obter-status-administrativo.use-case.js";
describe("status administrativo", () => {
  it("delega sem expor configuração", async () => {
    const data = {
        database: { status: "ok", pool: { total: 2, idle: 1, waiting: 0 } },
        process: { uptimeSeconds: 1, memory: {} },
      },
      obter = vi.fn().mockResolvedValue(data);
    const result = await new ObterStatusAdministrativoUseCase({
      obter,
    }).execute();
    expect(result).toBe(data);
    expect(JSON.stringify(result)).not.toMatch(
      /password|secret|host|connection/i,
    );
  });
});
