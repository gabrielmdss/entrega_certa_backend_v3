export type CoverageStatus =
  "SAUDAVEL" | "ATENCAO" | "CRITICO" | "SEM_PLANEJAMENTO";

export interface DashboardQueryPort {
  obter(): Promise<unknown>;
}

export interface CoverageInput {
  demanda: number;
  cestasMontadas: number;
  itens: Array<{
    apresentacaoInsumoId: string;
    nome: string;
    apresentacao: string;
    quantidadePorCesta: number;
    fisico: number;
    reservadoTotal: number;
    reservadoOutros: number;
    reservaPropria: number;
    entradaMediaMensal: number;
  }>;
}

export function calcularCobertura(input: CoverageInput, mesesProjetados = 0) {
  if (input.itens.length === 0) {
    return { capacidadeGarantida: 0, capacidadeProjetada: 0, insumos: [] };
  }
  const insumos = input.itens.map((item) => {
    // A reserva própria continua dentro do saldo físico e apenas o protege;
    // somente reservas de outros planos são indisponíveis para este cálculo.
    const disponivelParaPlano = Math.max(item.fisico - item.reservadoOutros, 0);
    const capacidade = Math.floor(
      disponivelParaPlano / item.quantidadePorCesta,
    );
    const capacidadeProjetada = Math.floor(
      (disponivelParaPlano + item.entradaMediaMensal * mesesProjetados) /
        item.quantidadePorCesta,
    );
    const necessario =
      Math.max(input.demanda - input.cestasMontadas, 0) *
      item.quantidadePorCesta;
    return {
      apresentacaoInsumoId: item.apresentacaoInsumoId,
      nome: item.nome,
      apresentacao: item.apresentacao,
      necessario,
      fisico: item.fisico,
      reservado: item.reservadoTotal,
      disponivel: Math.max(item.fisico - item.reservadoTotal, 0),
      deficit: Math.max(necessario - disponivelParaPlano, 0),
      capacidade,
      capacidadeProjetada,
      limitante: false,
    };
  });
  const porInsumos = Math.min(...insumos.map((i) => i.capacidade));
  const porInsumosProjetado = Math.min(
    ...insumos.map((i) => i.capacidadeProjetada),
  );
  const capacidadeGarantida = input.cestasMontadas + porInsumos;
  const capacidadeProjetada = input.cestasMontadas + porInsumosProjetado;
  for (const item of insumos) item.limitante = item.capacidade === porInsumos;
  return { capacidadeGarantida, capacidadeProjetada, insumos };
}

export function percentual(capacidade: number, demanda: number): number {
  return demanda === 0
    ? 100
    : Math.round((Math.min(capacidade, demanda) / demanda) * 10_000) / 100;
}

export function statusCobertura(
  capacidade: number,
  demanda: number,
  possuiPlanejamento: boolean,
): CoverageStatus {
  if (!possuiPlanejamento) return "SEM_PLANEJAMENTO";
  const p = percentual(capacidade, demanda);
  return p >= 100 ? "SAUDAVEL" : p >= 80 ? "ATENCAO" : "CRITICO";
}
