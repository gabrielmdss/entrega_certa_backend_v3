import type { Beneficiario } from '../entities/beneficiario.entity.js';

export interface BeneficiarioRepository {
  findById(id: string): Promise<Beneficiario | null>;
}
