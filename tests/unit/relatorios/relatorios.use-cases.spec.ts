import { describe, expect, it, vi } from "vitest";
import {
  ListarRelatorioBeneficiariosUseCase,
  ListarRelatorioDistribuicoesUseCase,
  ListarRelatorioEstoqueUseCase,
} from "../../../src/application/relatorios/use-cases/relatorios.use-cases.js";
const result = {
  data: [],
  meta: { page: 1, limit: 50, total: 0, totalPages: 0 },
};
describe("relatórios", () => {
  it("propaga paginação e filtros", async () => {
    const port = {
      distribuicoes: vi.fn().mockResolvedValue(result),
      beneficiarios: vi.fn().mockResolvedValue(result),
      estoque: vi.fn().mockResolvedValue(result),
    };
    const f = { page: 2, limit: 10, status: "ENCERRADA" };
    await expect(
      new ListarRelatorioDistribuicoesUseCase(port).execute(f),
    ).resolves.toEqual(result);
    expect(port.distribuicoes).toHaveBeenCalledWith(f);
    await new ListarRelatorioBeneficiariosUseCase(port).execute({
      page: 1,
      limit: 50,
    });
    await new ListarRelatorioEstoqueUseCase(port).execute({
      page: 1,
      limit: 50,
    });
    expect(port.beneficiarios).toHaveBeenCalledOnce();
    expect(port.estoque).toHaveBeenCalledOnce();
  });
});
