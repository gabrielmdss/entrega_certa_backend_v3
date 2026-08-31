import type { PlanejamentoPort } from "../ports/planejamento.port.js";
export class SimularPlanejamentoUseCase {
  constructor(private p: PlanejamentoPort) {}
  execute(i: Parameters<PlanejamentoPort["simular"]>[0]) {
    return this.p.simular(i);
  }
}
export class CriarPlanejamentoUseCase {
  constructor(private p: PlanejamentoPort) {}
  execute(i: Parameters<PlanejamentoPort["criar"]>[0]) {
    return this.p.criar(i);
  }
}
export class ListarPlanejamentosUseCase {
  constructor(private p: PlanejamentoPort) {}
  execute() {
    return this.p.listar();
  }
}
export class ObterPlanejamentoUseCase {
  constructor(private p: PlanejamentoPort) {}
  execute(id: string) {
    return this.p.obter(id);
  }
}
export class AprovarPlanejamentoUseCase {
  constructor(private p: PlanejamentoPort) {}
  execute(i: Parameters<PlanejamentoPort["aprovar"]>[0]) {
    return this.p.aprovar(i);
  }
}
export class RevisarPlanejamentoUseCase {
  constructor(private p: PlanejamentoPort) {}
  execute(i: Parameters<PlanejamentoPort["revisar"]>[0]) {
    return this.p.revisar(i);
  }
}
