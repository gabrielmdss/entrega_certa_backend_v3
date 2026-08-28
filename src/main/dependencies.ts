import { postgresPool } from '../infrastructure/database/postgres/connection/postgres.connection.js';
import { PostgresBeneficiarioRepository } from '../infrastructure/database/postgres/beneficiarios/postgres-beneficiario.repository.js';
import { ObterBeneficiarioUseCase } from '../application/beneficiarios/use-cases/obter-beneficiario.use-case.js';
import { BeneficiariosController } from '../presentation/http/beneficiarios/beneficiarios.controller.js';

const repo = new PostgresBeneficiarioRepository(postgresPool);
const obter = new ObterBeneficiarioUseCase(repo);
export const dependencies = { postgresPool, beneficiariosController: new BeneficiariosController(obter) };
