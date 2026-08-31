import { describe, expect, it, vi } from "vitest";
import type { CestasPort } from "../../../src/application/cestas/ports/cestas.port.js";
import {
  CriarModeloCestaUseCase,
  CriarVersaoModeloCestaUseCase,
} from "../../../src/application/cestas/use-cases/cestas.use-cases.js";
describe("modelos de cesta", () => {
  it("cria modelo", async () => {
    const p = {
      criarModelo: vi.fn().mockResolvedValue({ id: "1" }),
    } as unknown as CestasPort;
    await expect(
      new CriarModeloCestaUseCase(p).execute({
        nome: "Regular",
        tipo: "REGULAR",
      }),
    ).resolves.toEqual({ id: "1" });
  });
  it("cria nova versão sem sobrescrever", async () => {
    const p = {
      criarVersao: vi.fn().mockResolvedValue({ id: "2", numeroVersao: 2 }),
    } as unknown as CestasPort;
    await new CriarVersaoModeloCestaUseCase(p).execute({
      modeloId: "1",
      metaItens: 2,
      itens: [{ apresentacaoInsumoId: "3", quantidade: 2 }],
      usuarioId: "4",
    });
    expect(p.criarVersao).toHaveBeenCalledWith(
      expect.objectContaining({ metaItens: 2 }),
    );
  });
});
