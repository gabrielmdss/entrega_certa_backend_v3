import type { AuthQueryPort } from '../ports/auth-query.port.js';
import type { PasswordHasherPort } from '../ports/password-hasher.port.js';
import { DomainError } from '../../../shared/errors/domain-error.js';

export class AlterarSenhaUseCase {
  constructor(private readonly users: AuthQueryPort, private readonly passwords: PasswordHasherPort) {}
  async execute(input: { usuarioId: string; senhaAtual: string; novaSenha: string }): Promise<void> {
    const senhaHash = await this.users.getSenhaHash(input.usuarioId);
    if (!senhaHash || !(await this.passwords.compare(input.senhaAtual, senhaHash)))
      throw new DomainError('CREDENCIAIS_INVALIDAS', 'Senha atual inválida');
    const novoHash = await this.passwords.hash(input.novaSenha);
    await this.users.atualizarSenha(input.usuarioId, novoHash);
  }
}
