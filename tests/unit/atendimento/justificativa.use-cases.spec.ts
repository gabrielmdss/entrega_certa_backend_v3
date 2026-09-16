import { describe, expect, it, vi } from "vitest";
import {
  AvaliarJustificativaUseCase,
  RegistrarJustificativaUseCase,
} from "../../../src/application/atendimento/use-cases/justificativa.use-cases.js";
import type { JustificativaCommandPort } from "../../../src/application/atendimento/ports/justificativa-command.port.js";
function port(): JustificativaCommandPort {
  return {
    registrar: vi.fn().mockResolvedValue({ id: "1" }),
    avaliar: vi.fn().mockResolvedValue(undefined),
  };
}
describe("justificativas", () => {
  it("registra justificativa pendente", async () => {
    const p = port();
    await expect(
      new RegistrarJustificativaUseCase(p).execute({
        ausenciaId: "2",
        descricao: " Hospitalização ",
        momento: "DEPOIS_DISTRIBUICAO",
        usuarioId: "3",
      }),
    ).resolves.toEqual({ id: "1" });
    expect(p.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ descricao: "Hospitalização" }),
    );
  });
  it.each(["ACEITA", "REJEITADA"] as const)(
    "avalia como %s",
    async (decisao) => {
      const p = port();
      await new AvaliarJustificativaUseCase(p).execute({
        justificativaId: "1",
        decisao,
        observacao: null,
        usuarioId: "3",
      });
      expect(p.avaliar).toHaveBeenCalled();
    },
  );
  it("propaga segunda avaliação inválida", async () => {
    const p = port();
    vi.mocked(p.avaliar).mockRejectedValue(
      new Error("JUSTIFICATIVA_JA_AVALIADA"),
    );
    await expect(
      new AvaliarJustificativaUseCase(p).execute({
        justificativaId: "1",
        decisao: "ACEITA",
        observacao: null,
        usuarioId: "3",
      }),
    ).rejects.toThrow("JUSTIFICATIVA_JA_AVALIADA");
  });
});
