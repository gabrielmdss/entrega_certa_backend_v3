import type { CestasPort } from "../ports/cestas.port.js";
export class ListarModelosCestaUseCase {
  constructor(private p: CestasPort) {}
  execute() {
    return this.p.listarModelos();
  }
}
export class ObterModeloCestaUseCase {
  constructor(private p: CestasPort) {}
  execute(id: string) {
    return this.p.obterModelo(id);
  }
}
export class CriarModeloCestaUseCase {
  constructor(private p: CestasPort) {}
  execute(i: Parameters<CestasPort["criarModelo"]>[0]) {
    return this.p.criarModelo(i);
  }
}
export class CriarVersaoModeloCestaUseCase {
  constructor(private p: CestasPort) {}
  execute(i: Parameters<CestasPort["criarVersao"]>[0]) {
    return this.p.criarVersao(i);
  }
}
