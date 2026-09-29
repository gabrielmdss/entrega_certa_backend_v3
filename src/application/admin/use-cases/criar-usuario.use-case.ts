import type { UsuariosPort } from "../ports/usuarios.port.js";
import type { PasswordHasherPort } from "../../auth/ports/password-hasher.port.js";

export class CriarUsuarioUseCase {
  constructor(
    private readonly port: UsuariosPort,
    private readonly hasher: PasswordHasherPort,
  ) {}
  async execute(input: { login: string; senha: string; perfilIds: string[] }) {
    const senhaHash = await this.hasher.hash(input.senha);
    return this.port.criar({
      login: input.login,
      senhaHash,
      perfilIds: input.perfilIds,
    });
  }
}
