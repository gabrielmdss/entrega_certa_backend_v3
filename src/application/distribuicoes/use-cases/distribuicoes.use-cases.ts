import type { DistribuicaoPort } from "../ports/distribuicao.port.js";
import { DomainError } from "../../../shared/errors/domain-error.js";
export class ListarDistribuicoesUseCase {
  constructor(private readonly p: DistribuicaoPort) {}
  execute(f: {
    competenciaId?: string;
    grupoId?: string;
    status?: string;
    data?: string;
  }) {
    return this.p.listar(f);
  }
}
export class ObterDistribuicaoUseCase {
  constructor(private readonly p: DistribuicaoPort) {}
  async execute(id: string) {
    const r = await this.p.obter(id);
    if (!r)
      throw new DomainError(
        "DISTRIBUICAO_NAO_ENCONTRADA",
        "Distribuição não encontrada",
      );
    return r;
  }
}
export class RemarcarDistribuicaoUseCase {
  constructor(private readonly p: DistribuicaoPort) {}
  execute(i: {
    id: string;
    novaData: string;
    motivo: string;
    usuarioId: string;
  }) {
    return this.p.remarcar(i);
  }
}
