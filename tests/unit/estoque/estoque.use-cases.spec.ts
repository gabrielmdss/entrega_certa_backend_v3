import { describe, expect, it, vi } from "vitest";
import type { EstoquePort } from "../../../src/application/estoque/ports/estoque.port.js";
import {
  ConcluirInventarioUseCase,
  DesmontarCestasUseCase,
  LiberarCestasDistribuicaoUseCase,
  MontarCestasUseCase,
  RegistrarEntradaEstoqueUseCase,
  RegistrarPerdaEstoqueUseCase,
} from "../../../src/application/estoque/use-cases/estoque.use-cases.js";
function port(method: Partial<EstoquePort>) {
  return method as EstoquePort;
}
describe("estoque use cases", () => {
  it("registra entrada", async () => {
    const registrarEntrada = vi.fn().mockResolvedValue({ id: "1" }),
      p = port({ registrarEntrada });
    await new RegistrarEntradaEstoqueUseCase(p).execute({
      tipo: "DOACAO",
      doadorId: null,
      dataEntrada: null,
      observacao: null,
      itens: [{ apresentacaoInsumoId: "1", quantidade: 60, validade: null }],
      usuarioId: "2",
    });
    expect(registrarEntrada).toHaveBeenCalled();
  });
  it("delega perda e preserva bloqueio de saldo", async () => {
    const registrarPerda = vi
        .fn()
        .mockRejectedValue(new Error("SALDO_INSUFICIENTE")),
      p = port({ registrarPerda });
    await expect(
      new RegistrarPerdaEstoqueUseCase(p).execute({
        apresentacaoInsumoId: "1",
        quantidade: 5,
        motivoId: "1",
        observacao: null,
        usuarioId: "2",
      }),
    ).rejects.toThrow("SALDO_INSUFICIENTE");
  });
  it("conclui inventário pela operação explícita", async () => {
    const concluirInventario = vi.fn(),
      p = port({ concluirInventario });
    await new ConcluirInventarioUseCase(p).execute({
      inventarioId: "1",
      usuarioId: "2",
    });
    expect(concluirInventario).toHaveBeenCalled();
  });
  it("monta cestas", async () => {
    const montar = vi.fn().mockResolvedValue({ id: "3" }),
      p = port({ montar });
    await expect(
      new MontarCestasUseCase(p).execute({
        planejamentoVersaoId: "1",
        quantidade: 10,
        usuarioId: "2",
      }),
    ).resolves.toEqual({ id: "3" });
  });
  it("desmonta e devolve insumos", async () => {
    const desmontar = vi.fn(),
      p = port({ desmontar });
    await new DesmontarCestasUseCase(p).execute({
      loteId: "1",
      quantidade: 2,
      motivo: "ajuste",
      usuarioId: "2",
    });
    expect(desmontar).toHaveBeenCalled();
  });
  it("libera sem entregar", async () => {
    const liberar = vi.fn().mockResolvedValue({ id: "4" }),
      p = port({ liberar });
    await new LiberarCestasDistribuicaoUseCase(p).execute({
      distribuicaoId: "1",
      loteMontagemId: "2",
      quantidade: 5,
      usuarioId: "3",
    });
    expect(liberar).toHaveBeenCalled();
  });
});
