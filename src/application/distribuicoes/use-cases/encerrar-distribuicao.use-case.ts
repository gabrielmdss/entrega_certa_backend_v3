import type { DistribuicaoCommandPort } from "../ports/distribuicao-command.port.js";
export class EncerrarDistribuicaoUseCase {
  constructor(private port: DistribuicaoCommandPort) {}
  execute(i: { id: string; usuarioId: string }) {
    return this.port.encerrar(i);
  }
}
