import { describe, expect, it, vi } from "vitest";
import { ObterDashboardUseCase } from "../../../src/application/dashboard/use-cases/obter-dashboard.use-case.js";
describe("ObterDashboardUseCase", () => {
  it("delega ao read model", async () => {
    const data = { beneficiarios: { ativos: 30 } },
      obter = vi.fn().mockResolvedValue(data);
    await expect(new ObterDashboardUseCase({ obter }).execute()).resolves.toBe(
      data,
    );
    expect(obter).toHaveBeenCalledOnce();
  });
});
