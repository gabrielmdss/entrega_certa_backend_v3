export interface DistribuicaoOutput {
  id: string;
  competencia: { id: string; ano: number; mes: number };
  grupo: { id: string; codigo: string; nome: string };
  dataPrevista: string;
  dataReal: string | null;
  status: string;
  previstos: number;
  checkIns: number;
  regularesPresentes: number;
  pendentesPresentes: number;
  retiradas: number;
  ausentes: number;
  naoAtendidosEstoque: number;
  naoAtendidosIrregularidade: number;
  cestasLiberadas: number;
  cestasConsumidas: number;
  cestasRetornadas: number;
  cestasDisponiveis: number;
}
export interface DistribuicaoPort {
  listar(f: {
    competenciaId?: string;
    grupoId?: string;
    status?: string;
    data?: string;
  }): Promise<DistribuicaoOutput[]>;
  obter(id: string): Promise<DistribuicaoOutput | null>;
  remarcar(i: {
    id: string;
    novaData: string;
    motivo: string;
    usuarioId: string;
  }): Promise<void>;
}
