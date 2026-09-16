import { DomainError } from "../../../shared/errors/domain-error.js";
import type {
  DecisaoJustificativa,
  JustificativaCommandPort,
  MomentoJustificativa,
} from "../ports/justificativa-command.port.js";
export class RegistrarJustificativaUseCase {
  constructor(private readonly port: JustificativaCommandPort) {}
  execute(i: {
    ausenciaId: string;
    descricao: string;
    momento: MomentoJustificativa;
    usuarioId: string;
  }) {
    if (!i.descricao.trim())
      throw new DomainError("DESCRICAO_OBRIGATORIA", "Descrição obrigatória");
    return this.port.registrar({ ...i, descricao: i.descricao.trim() });
  }
}
export class AvaliarJustificativaUseCase {
  constructor(private readonly port: JustificativaCommandPort) {}
  execute(i: {
    justificativaId: string;
    decisao: DecisaoJustificativa;
    observacao: string | null;
    usuarioId: string;
  }) {
    return this.port.avaliar(i);
  }
}
