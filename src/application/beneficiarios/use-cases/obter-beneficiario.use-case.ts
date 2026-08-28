import type { BeneficiarioRepository } from '../../../domain/beneficiarios/repositories/beneficiario.repository.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import type { ObterBeneficiarioOutput } from '../dto/obter-beneficiario.output.js';

export class ObterBeneficiarioUseCase {
  constructor(private readonly beneficiarios: BeneficiarioRepository) {}

  async execute(id: string): Promise<ObterBeneficiarioOutput> {
    const beneficiario = await this.beneficiarios.findById(id);
    if (!beneficiario) throw new DomainError('BENEFICIARIO_NAO_ENCONTRADO', 'Beneficiário não encontrado');
    return {
      id: beneficiario.id,
      pessoaId: beneficiario.pessoaId,
      status: beneficiario.getStatus(),
      grupoDistribuicaoId: beneficiario.getGrupoDistribuicaoId(),
    };
  }
}
