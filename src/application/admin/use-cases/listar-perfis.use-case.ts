import type { UsuariosPort } from "../ports/usuarios.port.js";

export class ListarPerfisUseCase {
  constructor(private readonly port: UsuariosPort) {}
  execute() {
    return this.port.listarPerfis();
  }
}
