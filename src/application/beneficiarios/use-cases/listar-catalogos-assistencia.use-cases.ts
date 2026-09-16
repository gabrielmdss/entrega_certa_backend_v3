import type { CatalogosAssistenciaPort } from "../ports/catalogos-assistencia.port.js";
export class ListarGruposDistribuicaoUseCase { constructor(private readonly port: CatalogosAssistenciaPort) {} execute() { return this.port.listarGrupos(); } }
export class ListarMotivosDesligamentoUseCase { constructor(private readonly port: CatalogosAssistenciaPort) {} execute() { return this.port.listarMotivosDesligamento(); } }
