import { describe, expect, it } from 'vitest';
import { Beneficiario } from '../../../src/domain/beneficiarios/entities/beneficiario.entity.js';
import type { BeneficiarioRepository } from '../../../src/domain/beneficiarios/repositories/beneficiario.repository.js';
import { ObterBeneficiarioUseCase } from '../../../src/application/beneficiarios/use-cases/obter-beneficiario.use-case.js';

describe('ObterBeneficiarioUseCase', () => {
  it('retorna beneficiário existente', async () => {
    const repository: BeneficiarioRepository = { findById: async () => new Beneficiario('1','2','ATIVO','1') };
    const useCase = new ObterBeneficiarioUseCase(repository);
    await expect(useCase.execute('1')).resolves.toEqual({ id:'1', pessoaId:'2', status:'ATIVO', grupoDistribuicaoId:'1' });
  });
});
