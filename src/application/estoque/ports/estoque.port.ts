export interface EstoquePort {
  listarCategorias(): Promise<unknown[]>;
  listarInsumos(): Promise<unknown[]>;
  obterInsumo(id: string): Promise<unknown | null>;
  cadastrarInsumo(i: {
    nome: string;
    categoriaPrioridadeId: string | null;
    apresentacao: {
      descricao: string;
      quantidadeReferencia: number | null;
      unidadeMedida: string | null;
    };
  }): Promise<{ id: string; apresentacaoId: string }>;
  listarDoadores(): Promise<unknown[]>;
  criarDoador(i: {
    tipo: "PESSOA" | "INSTITUICAO";
    nome: string;
    telefone: string | null;
    observacao: string | null;
  }): Promise<{ id: string }>;
  atualizarDoador(i: {
    id: string;
    tipo: "PESSOA" | "INSTITUICAO";
    nome: string;
    telefone: string | null;
    observacao: string | null;
    ativo: boolean;
  }): Promise<void>;
  registrarEntrada(i: {
    tipo: "DOACAO" | "COMPRA" | "SALDO_INICIAL" | "AJUSTE_POSITIVO";
    doadorId: string | null;
    dataEntrada: string | null;
    observacao: string | null;
    itens: {
      apresentacaoInsumoId: string;
      quantidade: number;
      validade: string | null;
    }[];
    usuarioId: string;
  }): Promise<{ id: string }>;
  registrarPerda(i: {
    apresentacaoInsumoId: string;
    quantidade: number;
    motivoId: string;
    observacao: string | null;
    usuarioId: string;
  }): Promise<{ id: string }>;
  criarInventario(usuarioId: string): Promise<{ id: string }>;
  obterInventario(id: string): Promise<unknown | null>;
  informarItemInventario(i: {
    inventarioId: string;
    apresentacaoId: string;
    saldoFisico: number;
  }): Promise<void>;
  concluirInventario(i: {
    inventarioId: string;
    usuarioId: string;
  }): Promise<void>;
  montar(i: {
    planejamentoVersaoId: string;
    quantidade: number;
    usuarioId: string;
  }): Promise<{ id: string }>;
  listarLotes(): Promise<unknown[]>;
  obterLote(id: string): Promise<unknown | null>;
  desmontar(i: {
    loteId: string;
    quantidade: number;
    motivo: string;
    usuarioId: string;
  }): Promise<void>;
  ajustarLote(i: {
    loteId: string;
    quantidadeCestasAfetadas: number;
    motivo: string;
    itens: {
      apresentacaoInsumoId: string;
      operacao: "ADICIONAR" | "REMOVER";
      quantidadePorCesta: number;
    }[];
    usuarioId: string;
  }): Promise<{ id: string }>;
  liberar(i: {
    distribuicaoId: string;
    loteMontagemId: string;
    quantidade: number;
    usuarioId: string;
  }): Promise<{ id: string }>;
  listarLiberacoes(distribuicaoId: string): Promise<unknown[]>;
}
