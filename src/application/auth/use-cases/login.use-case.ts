import type { AuthQueryPort, AuthenticatedUser } from '../ports/auth-query.port.js';
import type { PasswordHasherPort } from '../ports/password-hasher.port.js';
import type { TokenServicePort } from '../ports/token-service.port.js';
import { DomainError } from '../../../shared/errors/domain-error.js';

export class LoginUseCase {
  constructor(private readonly users: AuthQueryPort, private readonly passwords: PasswordHasherPort, private readonly tokens: TokenServicePort) {}
  async execute(input: { login: string; senha: string }): Promise<{ accessToken: string; usuario: AuthenticatedUser }> {
    const user = await this.users.findByLogin(input.login);
    if (!user || !(await this.passwords.compare(input.senha, user.senhaHash))) throw new DomainError('CREDENCIAIS_INVALIDAS', 'Login ou senha inválidos');
    if (!user.ativo) throw new DomainError('USUARIO_INATIVO', 'Usuário inativo');
    const { senhaHash: _senhaHash, ...usuario } = user;
    void _senhaHash;
    const accessToken = await this.tokens.sign({ subject: user.id });
    await this.users.registerLogin(user.id);
    return { accessToken, usuario };
  }
}
