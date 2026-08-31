import { describe, expect, it, vi } from "vitest";
import {
  ObterHistoricoBeneficiarioUseCase,
  ObterHistoricoDistribuicaoUseCase,
} from "../../../src/application/historicos/use-cases/historicos.use-cases.js";
describe("históricos assistenciais", () => {
  it("obtém beneficiário e distribuição", async () => {
    const q = {
      beneficiario: vi
        .fn()
        .mockResolvedValue({ eventos: [{ tipo: "ADMISSAO" }] }),
      distribuicao: vi
        .fn()
        .mockResolvedValue({ eventos: [{ tipo: "ABERTURA" }] }),
    };
    await expect(
      new ObterHistoricoBeneficiarioUseCase(q).execute("1"),
    ).resolves.toMatchObject({ eventos: [{ tipo: "ADMISSAO" }] });
    await expect(
      new ObterHistoricoDistribuicaoUseCase(q).execute("2"),
    ).resolves.toMatchObject({ eventos: [{ tipo: "ABERTURA" }] });
  });
  it("distingue ausências", async () => {
    const q = {
      beneficiario: vi.fn().mockResolvedValue(null),
      distribuicao: vi.fn().mockResolvedValue(null),
    };
    await expect(
      new ObterHistoricoBeneficiarioUseCase(q).execute("1"),
    ).rejects.toMatchObject({ code: "BENEFICIARIO_NAO_ENCONTRADO" });
    await expect(
      new ObterHistoricoDistribuicaoUseCase(q).execute("1"),
    ).rejects.toMatchObject({ code: "DISTRIBUICAO_NAO_ENCONTRADA" });
  });
});
