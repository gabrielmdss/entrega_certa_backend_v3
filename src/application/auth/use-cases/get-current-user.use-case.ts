import type { AuthQueryPort, AuthenticatedUser } from '../ports/auth-query.port.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
export class GetCurrentUserUseCase {
  constructor(private readonly users: AuthQueryPort) {}
  async execute(id: string): Promise<AuthenticatedUser> {
    const user = await this.users.findById(id);
    if (!user || !user.ativo) throw new DomainError('NAO_AUTENTICADO', 'Usuário não autenticado');
    return user;
  }
}
