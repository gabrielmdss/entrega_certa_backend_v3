import { DomainError } from "../../../shared/errors/domain-error.js";
import type { HistoricosQueryPort } from "../ports/historicos-query.port.js";
export class ObterHistoricoBeneficiarioUseCase {
  constructor(private readonly q: HistoricosQueryPort) {}
  async execute(id: string) {
    const x = await this.q.beneficiario(id);
    if (!x)
      throw new DomainError(
        "BENEFICIARIO_NAO_ENCONTRADO",
        "Beneficiário não encontrado",
      );
    return x;
  }
}
export class ObterHistoricoDistribuicaoUseCase {
  constructor(private readonly q: HistoricosQueryPort) {}
  async execute(id: string) {
    const x = await this.q.distribuicao(id);
    if (!x)
      throw new DomainError(
        "DISTRIBUICAO_NAO_ENCONTRADA",
        "Distribuição não encontrada",
      );
    return x;
  }
}
