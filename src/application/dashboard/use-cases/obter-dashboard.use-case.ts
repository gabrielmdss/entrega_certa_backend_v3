import type { DashboardQueryPort } from "../ports/dashboard-query.port.js";
export class ObterDashboardUseCase {
  constructor(private readonly query: DashboardQueryPort) {}
  execute() {
    return this.query.obter();
  }
}
export class ObterSaudeEntregaUseCase extends ObterDashboardUseCase {}
