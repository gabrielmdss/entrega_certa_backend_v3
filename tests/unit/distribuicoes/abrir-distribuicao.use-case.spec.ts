import { describe, expect, it, vi } from "vitest";
import { AbrirDistribuicaoUseCase } from "../../../src/application/distribuicoes/use-cases/abrir-distribuicao.use-case.js";
import type { DistribuicaoCommandPort } from "../../../src/application/distribuicoes/ports/distribuicao-command.port.js";
describe("AbrirDistribuicaoUseCase", () => {
  it("delega abertura", async () => {
    const p: DistribuicaoCommandPort = { abrir: vi.fn(), encerrar: vi.fn() };
    await new AbrirDistribuicaoUseCase(p).execute({ id: "1", usuarioId: "1" });
    expect(p.abrir).toHaveBeenCalled();
  });
});
