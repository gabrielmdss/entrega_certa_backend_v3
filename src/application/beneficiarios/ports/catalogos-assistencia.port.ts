export interface CatalogosAssistenciaPort {
  listarGrupos(): Promise<Array<{ id: string; codigo: string; nome: string; regraCalendario: string }>>;
  listarMotivosDesligamento(): Promise<Array<{ id: string; codigo: string; descricao: string }>>;
}
