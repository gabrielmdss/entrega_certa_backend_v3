import type { DistribuicaoCommandPort } from "../ports/distribuicao-command.port.js";
export class AbrirDistribuicaoUseCase {
  constructor(private readonly p: DistribuicaoCommandPort) {}
  execute(i: { id: string; usuarioId: string }) {
    return this.p.abrir(i);
  }
}
