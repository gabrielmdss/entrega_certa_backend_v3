export interface PlanejamentoPort {
  simular(i: {
    competenciaId: string;
    modeloCestaVersaoId: string;
    quantidade: number;
  }): Promise<unknown>;
  criar(i: {
    competenciaId: string;
    modeloCestaVersaoId: string;
    quantidade: number;
  }): Promise<{ id: string; versaoId: string }>;
  listar(): Promise<unknown[]>;
  obter(id: string): Promise<unknown | null>;
  aprovar(i: { id: string; usuarioId: string }): Promise<void>;
  revisar(i: {
    id: string;
    quantidade: number;
    modeloCestaVersaoId: string;
    motivo: string;
  }): Promise<{ versaoId: string }>;
}
