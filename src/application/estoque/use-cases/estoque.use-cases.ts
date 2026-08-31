import type { EstoquePort } from "../ports/estoque.port.js";
export class ListarCategoriasPrioridadeUseCase {
  constructor(private p: EstoquePort) {}
  execute() {
    return this.p.listarCategorias();
  }
}
export class ListarInsumosUseCase {
  constructor(private p: EstoquePort) {}
  execute() {
    return this.p.listarInsumos();
  }
}
export class ObterInsumoUseCase {
  constructor(private p: EstoquePort) {}
  execute(id: string) {
    return this.p.obterInsumo(id);
  }
}
export class CadastrarInsumoUseCase {
  constructor(private p: EstoquePort) {}
  execute(i: Parameters<EstoquePort["cadastrarInsumo"]>[0]) {
    return this.p.cadastrarInsumo(i);
  }
}
export class ListarDoadoresUseCase {
  constructor(private p: EstoquePort) {}
  execute() {
    return this.p.listarDoadores();
  }
}
export class CriarDoadorUseCase {
  constructor(private p: EstoquePort) {}
  execute(i: Parameters<EstoquePort["criarDoador"]>[0]) {
    return this.p.criarDoador(i);
  }
}
export class AtualizarDoadorUseCase {
  constructor(private p: EstoquePort) {}
  execute(i: Parameters<EstoquePort["atualizarDoador"]>[0]) {
    return this.p.atualizarDoador(i);
  }
}
export class RegistrarEntradaEstoqueUseCase {
  constructor(private p: EstoquePort) {}
  execute(i: Parameters<EstoquePort["registrarEntrada"]>[0]) {
    return this.p.registrarEntrada(i);
  }
}
export class RegistrarPerdaEstoqueUseCase {
  constructor(private p: EstoquePort) {}
  execute(i: Parameters<EstoquePort["registrarPerda"]>[0]) {
    return this.p.registrarPerda(i);
  }
}
export class CriarInventarioUseCase {
  constructor(private p: EstoquePort) {}
  execute(usuarioId: string) {
    return this.p.criarInventario(usuarioId);
  }
}
export class ObterInventarioUseCase {
  constructor(private p: EstoquePort) {}
  execute(id: string) {
    return this.p.obterInventario(id);
  }
}
export class InformarItemInventarioUseCase {
  constructor(private p: EstoquePort) {}
  execute(i: Parameters<EstoquePort["informarItemInventario"]>[0]) {
    return this.p.informarItemInventario(i);
  }
}
export class ConcluirInventarioUseCase {
  constructor(private p: EstoquePort) {}
  execute(i: Parameters<EstoquePort["concluirInventario"]>[0]) {
    return this.p.concluirInventario(i);
  }
}
export class MontarCestasUseCase {
  constructor(private p: EstoquePort) {}
  execute(i: Parameters<EstoquePort["montar"]>[0]) {
    return this.p.montar(i);
  }
}
export class ListarLotesMontagemUseCase {
  constructor(private p: EstoquePort) {}
  execute() {
    return this.p.listarLotes();
  }
}
export class ObterLoteMontagemUseCase {
  constructor(private p: EstoquePort) {}
  execute(id: string) {
    return this.p.obterLote(id);
  }
}
export class DesmontarCestasUseCase {
  constructor(private p: EstoquePort) {}
  execute(i: Parameters<EstoquePort["desmontar"]>[0]) {
    return this.p.desmontar(i);
  }
}
export class AjustarLoteMontagemUseCase {
  constructor(private p: EstoquePort) {}
  execute(i: Parameters<EstoquePort["ajustarLote"]>[0]) {
    return this.p.ajustarLote(i);
  }
}
export class LiberarCestasDistribuicaoUseCase {
  constructor(private p: EstoquePort) {}
  execute(i: Parameters<EstoquePort["liberar"]>[0]) {
    return this.p.liberar(i);
  }
}
export class ListarLiberacoesCestasUseCase {
  constructor(private p: EstoquePort) {}
  execute(id: string) {
    return this.p.listarLiberacoes(id);
  }
}
