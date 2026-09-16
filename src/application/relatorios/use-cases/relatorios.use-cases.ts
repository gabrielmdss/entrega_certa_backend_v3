import type { RelatoriosQueryPort } from "../ports/relatorios-query.port.js";
export class ListarRelatorioDistribuicoesUseCase {
  constructor(private readonly q: RelatoriosQueryPort) {}
  execute(f: Parameters<RelatoriosQueryPort["distribuicoes"]>[0]) {
    return this.q.distribuicoes(f);
  }
}
export class ListarRelatorioBeneficiariosUseCase {
  constructor(private readonly q: RelatoriosQueryPort) {}
  execute(f: Parameters<RelatoriosQueryPort["beneficiarios"]>[0]) {
    return this.q.beneficiarios(f);
  }
}
export class ListarRelatorioEstoqueUseCase {
  constructor(private readonly q: RelatoriosQueryPort) {}
  execute(f: Parameters<RelatoriosQueryPort["estoque"]>[0]) {
    return this.q.estoque(f);
  }
}
