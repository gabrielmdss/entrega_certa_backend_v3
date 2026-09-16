export interface CestasPort {
  listarModelos(): Promise<unknown[]>;
  obterModelo(id: string): Promise<unknown | null>;
  criarModelo(i: {
    nome: string;
    tipo: "REGULAR" | "EMERGENCIAL" | "ESPECIAL" | "OUTRO";
  }): Promise<{ id: string }>;
  criarVersao(i: {
    modeloId: string;
    metaItens: number;
    itens: { apresentacaoInsumoId: string; quantidade: number }[];
    usuarioId: string;
  }): Promise<{ id: string; numeroVersao: number }>;
}
