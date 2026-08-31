import { describe, expect, it, vi } from "vitest";
import type { DistribuicaoCommandPort } from "../../../src/application/distribuicoes/ports/distribuicao-command.port.js";
import { EncerrarDistribuicaoUseCase } from "../../../src/application/distribuicoes/use-cases/encerrar-distribuicao.use-case.js";
describe("EncerrarDistribuicaoUseCase", () => {
  it("delega encerramento atômico", async () => {
    const port = {
      abrir: vi.fn(),
      encerrar: vi.fn(),
    } satisfies DistribuicaoCommandPort;
    await new EncerrarDistribuicaoUseCase(port).execute({
      id: "1",
      usuarioId: "2",
    });
    expect(port.encerrar).toHaveBeenCalledWith({ id: "1", usuarioId: "2" });
  });
  it("propaga conflito da segunda chamada", async () => {
    const port = {
      abrir: vi.fn(),
      encerrar: vi.fn().mockRejectedValue(new Error("DISTRIBUICAO_ENCERRADA")),
    } satisfies DistribuicaoCommandPort;
    await expect(
      new EncerrarDistribuicaoUseCase(port).execute({
        id: "1",
        usuarioId: "2",
      }),
    ).rejects.toThrow("DISTRIBUICAO_ENCERRADA");
  });
});
