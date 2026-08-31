import { describe, expect, it } from "vitest";
import {
  calcularCobertura,
  percentual,
  statusCobertura,
  type CoverageInput,
} from "../../../src/application/dashboard/ports/dashboard-query.port.js";
const item = (overrides: Partial<CoverageInput["itens"][number]> = {}) => ({
  apresentacaoInsumoId: "1",
  nome: "Arroz",
  apresentacao: "Pacote",
  quantidadePorCesta: 2,
  fisico: 200,
  reservadoTotal: 0,
  reservadoOutros: 0,
  reservaPropria: 0,
  entradaMediaMensal: 0,
  ...overrides,
});
describe("cálculos do dashboard", () => {
  it("calcula cobertura integral", () => {
    const r = calcularCobertura({
      demanda: 100,
      cestasMontadas: 0,
      itens: [item()],
    });
    expect(r.capacidadeGarantida).toBe(100);
    expect(percentual(r.capacidadeGarantida, 100)).toBe(100);
  });
  it("calcula cobertura parcial e déficit", () => {
    const r = calcularCobertura({
      demanda: 100,
      cestasMontadas: 0,
      itens: [item({ fisico: 150 })],
    });
    expect(r.capacidadeGarantida).toBe(75);
    expect(r.insumos[0]?.deficit).toBe(50);
  });
  it("trata estoque zero", () =>
    expect(
      calcularCobertura({
        demanda: 10,
        cestasMontadas: 0,
        itens: [item({ fisico: 0 })],
      }).capacidadeGarantida,
    ).toBe(0));
  it("identifica ausência de planejamento", () =>
    expect(statusCobertura(0, 10, false)).toBe("SEM_PLANEJAMENTO"));
  it("respeita reservas de outros planos sem descontar a própria", () => {
    const r = calcularCobertura({
      demanda: 100,
      cestasMontadas: 0,
      itens: [
        item({
          fisico: 200,
          reservadoTotal: 140,
          reservadoOutros: 60,
          reservaPropria: 80,
        }),
      ],
    });
    expect(r.capacidadeGarantida).toBe(70);
  });
  it("soma cestas compatíveis sem recontar seus insumos", () => {
    const r = calcularCobertura({
      demanda: 100,
      cestasMontadas: 20,
      itens: [item({ fisico: 120 })],
    });
    expect(r.capacidadeGarantida).toBe(80);
  });
  it("usa o insumo limitante", () => {
    const r = calcularCobertura({
      demanda: 100,
      cestasMontadas: 0,
      itens: [
        item(),
        item({
          apresentacaoInsumoId: "2",
          nome: "Feijão",
          quantidadePorCesta: 1,
          fisico: 42,
        }),
      ],
    });
    expect(r.capacidadeGarantida).toBe(42);
    expect(r.insumos[1]?.limitante).toBe(true);
  });
  it("marca mais de um limitante", () => {
    const r = calcularCobertura({
      demanda: 100,
      cestasMontadas: 0,
      itens: [
        item({ fisico: 100 }),
        item({ apresentacaoInsumoId: "2", quantidadePorCesta: 1, fisico: 50 }),
      ],
    });
    expect(r.insumos.filter((i) => i.limitante)).toHaveLength(2);
  });
  it("mantém projeção separada da garantia", () => {
    const r = calcularCobertura(
      {
        demanda: 100,
        cestasMontadas: 0,
        itens: [item({ fisico: 60, entradaMediaMensal: 20 })],
      },
      2,
    );
    expect(r.capacidadeGarantida).toBe(30);
    expect(r.capacidadeProjetada).toBe(50);
  });
  it("sem histórico não aumenta a projeção", () => {
    const r = calcularCobertura(
      {
        demanda: 100,
        cestasMontadas: 0,
        itens: [item({ fisico: 60, entradaMediaMensal: 0 })],
      },
      3,
    );
    expect(r.capacidadeProjetada).toBe(r.capacidadeGarantida);
  });
  it("histórico insuficiente produz apenas o incremento explicável", () => {
    const r = calcularCobertura(
      {
        demanda: 100,
        cestasMontadas: 0,
        itens: [item({ fisico: 40, entradaMediaMensal: 5 })],
      },
      1,
    );
    expect(r.capacidadeProjetada - r.capacidadeGarantida).toBe(2);
  });
  it("queda recente mantém a garantia baseada apenas no físico", () => {
    const r = calcularCobertura(
      {
        demanda: 100,
        cestasMontadas: 0,
        itens: [item({ fisico: 20, entradaMediaMensal: 30 })],
      },
      1,
    );
    expect(r.capacidadeGarantida).toBe(10);
    expect(r.capacidadeProjetada).toBe(25);
  });
});
