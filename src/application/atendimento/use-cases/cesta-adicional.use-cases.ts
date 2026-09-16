import type { CestaAdicionalPort } from "../ports/cesta-adicional.port.js";

export class AutorizarCestaAdicionalUseCase {
  constructor(private readonly port: CestaAdicionalPort) {}
  execute(input: Parameters<CestaAdicionalPort["autorizar"]>[0]) {
    return this.port.autorizar({ ...input, justificativa: input.justificativa.trim() });
  }
}

export class EntregarCestaAdicionalUseCase {
  constructor(private readonly port: CestaAdicionalPort) {}
  execute(input: Parameters<CestaAdicionalPort["entregar"]>[0]) {
    return this.port.entregar(input);
  }
}

export class ListarCestasAdicionaisUseCase {
  constructor(private readonly port: CestaAdicionalPort) {}
  execute(distribuicaoId: string) {
    return this.port.listar(distribuicaoId);
  }
}
