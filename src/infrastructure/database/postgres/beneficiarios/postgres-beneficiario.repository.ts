import type { Pool } from 'pg';
import type { BeneficiarioRepository } from '../../../../domain/beneficiarios/repositories/beneficiario.repository.js';
import { Beneficiario } from '../../../../domain/beneficiarios/entities/beneficiario.entity.js';

interface BeneficiarioRow { id: string; pessoa_id: string; status: 'ATIVO' | 'DESLIGADO'; grupo_distribuicao_id: string | null; }

export class PostgresBeneficiarioRepository implements BeneficiarioRepository {
  constructor(private readonly db: Pool) {}
  async findById(id: string): Promise<Beneficiario | null> {
    const result = await this.db.query<BeneficiarioRow>(`
      SELECT id::text, pessoa_id::text, status, grupo_distribuicao_id::text
      FROM pastoral.beneficiarios
      WHERE id = $1
      LIMIT 1
    `, [id]);
    const row = result.rows[0];
    return row ? new Beneficiario(row.id, row.pessoa_id, row.status, row.grupo_distribuicao_id) : null;
  }
}
