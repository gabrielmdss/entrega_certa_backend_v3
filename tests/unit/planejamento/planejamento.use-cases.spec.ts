import { describe, expect, it, vi } from "vitest";
import type { PlanejamentoPort } from "../../../src/application/planejamento/ports/planejamento.port.js";
import {
  AprovarPlanejamentoUseCase,
  CriarPlanejamentoUseCase,
  RevisarPlanejamentoUseCase,
  SimularPlanejamentoUseCase,
} from "../../../src/application/planejamento/use-cases/planejamento.use-cases.js";
function p(method: Partial<PlanejamentoPort>) {
  return method as PlanejamentoPort;
}
const input = { competenciaId: "1", modeloCestaVersaoId: "2", quantidade: 300 };
describe("planejamento", () => {
  it("simula sem command de reserva", async () => {
    const simular = vi.fn().mockResolvedValue({ capacidadeMaxima: 250 }),
      port = p({ simular });
    await new SimularPlanejamentoUseCase(port).execute(input);
    expect(simular).toHaveBeenCalledOnce();
  });
  it("cria planejamento e versão", async () => {
    const criar = vi.fn().mockResolvedValue({ id: "1", versaoId: "2" });
    await expect(
      new CriarPlanejamentoUseCase(p({ criar })).execute(input),
    ).resolves.toEqual({ id: "1", versaoId: "2" });
  });
  it("aprova e cria reservas pelo port", async () => {
    const aprovar = vi.fn();
    await new AprovarPlanejamentoUseCase(p({ aprovar })).execute({
      id: "1",
      usuarioId: "2",
    });
    expect(aprovar).toHaveBeenCalled();
  });
  it("revisa criando outra versão", async () => {
    const revisar = vi.fn().mockResolvedValue({ versaoId: "3" });
    await expect(
      new RevisarPlanejamentoUseCase(p({ revisar })).execute({
        id: "1",
        quantidade: 310,
        modeloCestaVersaoId: "2",
        motivo: "demanda",
      }),
    ).resolves.toEqual({ versaoId: "3" });
  });
});
