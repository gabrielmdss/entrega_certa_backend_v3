import type { AdminStatusPort } from "../ports/admin-status.port.js";
export class ObterStatusAdministrativoUseCase {
  constructor(private readonly status: AdminStatusPort) {}
  execute() {
    return this.status.obter();
  }
}
