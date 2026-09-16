import type { BeneficiarioQueryPort } from '../ports/beneficiario-query.port.js';
import { DomainError } from '../../../shared/errors/domain-error.js';

export class ObterBeneficiarioUseCase {
  constructor(private readonly beneficiarios: BeneficiarioQueryPort) {}

  async execute(id: string) {
    const beneficiario = await this.beneficiarios.obterDetalhe(id);
    if (!beneficiario) throw new DomainError('BENEFICIARIO_NAO_ENCONTRADO', 'Beneficiário não encontrado');
    return beneficiario;
  }
}
