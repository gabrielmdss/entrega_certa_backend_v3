import { DomainError } from "../../../shared/errors/domain-error.js";
import type {
  AuditoriaFilters,
  AuditoriaQueryPort,
} from "../ports/auditoria-query.port.js";
export class ListarAuditoriaUseCase {
  constructor(private readonly q: AuditoriaQueryPort) {}
  execute(f: AuditoriaFilters) {
    return this.q.listar(f);
  }
}
export class ObterAuditoriaUseCase {
  constructor(private readonly q: AuditoriaQueryPort) {}
  async execute(id: string) {
    const item = await this.q.obter(id);
    if (!item)
      throw new DomainError(
        "AUDITORIA_NAO_ENCONTRADA",
        "Evento de auditoria não encontrado",
      );
    return item;
  }
}
