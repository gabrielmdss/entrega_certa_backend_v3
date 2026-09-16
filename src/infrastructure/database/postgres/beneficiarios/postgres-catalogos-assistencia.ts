import type { Pool } from "pg";
import type { CatalogosAssistenciaPort } from "../../../../application/beneficiarios/ports/catalogos-assistencia.port.js";
export class PostgresCatalogosAssistencia implements CatalogosAssistenciaPort {
  constructor(private readonly pool: Pool) {}
  async listarGrupos() {
    const rows = (await this.pool.query<{ id: string; codigo: string; nome: string; regra_calendario: string }>("SELECT id::text,codigo,nome,regra_calendario FROM pastoral.grupos_distribuicao WHERE ativo ORDER BY ordem,id")).rows;
    return rows.map((row) => ({ id: row.id, codigo: row.codigo, nome: row.nome, regraCalendario: row.regra_calendario }));
  }
  async listarMotivosDesligamento() {
    return (await this.pool.query<{ id: string; codigo: string; descricao: string }>("SELECT id::text,codigo,descricao FROM pastoral.motivos_desligamento WHERE ativo ORDER BY descricao,id")).rows;
  }
}
