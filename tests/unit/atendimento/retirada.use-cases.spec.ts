import { describe, expect, it, vi } from "vitest";
import { DomainError } from "../../../src/shared/errors/domain-error.js";
import {
  EstornarRetiradaUseCase,
  RegistrarRetiradaUseCase,
} from "../../../src/application/atendimento/use-cases/retirada.use-cases.js";
import type { RetiradaCommandPort } from "../../../src/application/atendimento/ports/retirada.port.js";
function port(
  context: {
    status: "VALIDA" | "ESTORNADA";
    operadorId: string;
    mesmoDia: boolean;
  } = { status: "VALIDA", operadorId: "9", mesmoDia: true },
): RetiradaCommandPort {
  return {
    registrar: vi.fn().mockResolvedValue({ id: "1" }),
    obterContextoEstorno: vi.fn().mockResolvedValue(context),
    estornar: vi.fn().mockResolvedValue(undefined),
  };
}
const base = {
  distribuicaoId: "1",
  beneficiarioId: "2",
  tipo: "TITULAR" as const,
  formaIdentificacao: "DOCUMENTO" as const,
  representante: null,
  justificativaExcecao: null,
  usuarioId: "9",
  permissoes: ["RETIRADA_REGISTRAR"],
};
describe("retiradas", () => {
  it.each(["TITULAR", "PRIMEIRA_ENTREGA", "CONTINGENCIA"] as const)(
    "registra %s",
    async (tipo) => {
      const p = port();
      await new RegistrarRetiradaUseCase(p).execute({ ...base, tipo });
      expect(p.registrar).toHaveBeenCalled();
    },
  );
  it("registra representante declaratório", async () => {
    const p = port();
    await new RegistrarRetiradaUseCase(p).execute({
      ...base,
      tipo: "REPRESENTANTE",
      formaIdentificacao: "REPRESENTANTE",
      representante: {
        nome: "João",
        documento: "123",
        relacao: "VIZINHO",
        autorizacaoDeclaratoria: true,
      },
    });
    expect(p.registrar).toHaveBeenCalled();
  });
  it("bloqueia representante sem autorização", async () => {
    expect(() =>
      new RegistrarRetiradaUseCase(port()).execute({
        ...base,
        tipo: "REPRESENTANTE",
        formaIdentificacao: "REPRESENTANTE",
        representante: {
          nome: "João",
          documento: null,
          relacao: null,
          autorizacaoDeclaratoria: false,
        },
      }),
    ).toThrow(expect.objectContaining({ code: "REPRESENTANTE_INVALIDO" }));
  });
  it("exige permissão superior e justificativa na antecipação", async () => {
    expect(() =>
      new RegistrarRetiradaUseCase(port()).execute({
        ...base,
        tipo: "ANTECIPADA",
      }),
    ).toThrow(expect.objectContaining({ code: "PERMISSAO_NEGADA" }));
    expect(() =>
      new RegistrarRetiradaUseCase(port()).execute({
        ...base,
        tipo: "ANTECIPADA",
        permissoes: ["RETIRADA_ESTORNAR_QUALQUER"],
      }),
    ).toThrow(expect.objectContaining({ code: "JUSTIFICATIVA_OBRIGATORIA" }));
  });
  it.each([
    "BENEFICIARIO_PENDENTE",
    "REGULARES_AGUARDANDO",
    "DIREITO_JA_CONSUMIDO",
    "DISTRIBUICAO_NAO_ABERTA",
    "CHECKIN_OBRIGATORIO",
    "BENEFICIARIO_DESLIGADO",
  ])("propaga bloqueio %s", async (code) => {
    const p = port();
    vi.mocked(p.registrar).mockRejectedValue(new DomainError(code, code));
    await expect(
      new RegistrarRetiradaUseCase(p).execute(base),
    ).rejects.toMatchObject({ code });
  });
});
describe("estorno", () => {
  it("permite estorno próprio no mesmo dia", async () => {
    const p = port();
    await new EstornarRetiradaUseCase(p).execute({
      retiradaId: "1",
      motivo: "erro",
      usuarioId: "9",
      permissoes: ["RETIRADA_ESTORNAR_PROPRIA"],
    });
    expect(p.estornar).toHaveBeenCalled();
  });
  it("bloqueia estorno próprio em outro dia", async () => {
    const p = port({ status: "VALIDA", operadorId: "9", mesmoDia: false });
    await expect(
      new EstornarRetiradaUseCase(p).execute({
        retiradaId: "1",
        motivo: "erro",
        usuarioId: "9",
        permissoes: ["RETIRADA_ESTORNAR_PROPRIA"],
      }),
    ).rejects.toMatchObject({ code: "ESTORNO_NAO_AUTORIZADO" });
  });
  it("permite estorno superior", async () => {
    const p = port({ status: "VALIDA", operadorId: "8", mesmoDia: false });
    await new EstornarRetiradaUseCase(p).execute({
      retiradaId: "1",
      motivo: "erro",
      usuarioId: "9",
      permissoes: ["RETIRADA_ESTORNAR_QUALQUER"],
    });
    expect(p.estornar).toHaveBeenCalled();
  });
  it("bloqueia segundo estorno", async () => {
    const p = port({ status: "ESTORNADA", operadorId: "9", mesmoDia: true });
    await expect(
      new EstornarRetiradaUseCase(p).execute({
        retiradaId: "1",
        motivo: "erro",
        usuarioId: "9",
        permissoes: ["RETIRADA_ESTORNAR_QUALQUER"],
      }),
    ).rejects.toMatchObject({ code: "RETIRADA_JA_ESTORNADA" });
  });
});
