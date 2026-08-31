export interface Pagination {
  page: number;
  limit: number;
}
export interface Paginated<T = unknown> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
export interface RelatoriosQueryPort {
  distribuicoes(
    f: Pagination & {
      dataInicio?: string | undefined;
      dataFim?: string | undefined;
      competencia?: string | undefined;
      grupoId?: string | undefined;
      status?: string | undefined;
    },
  ): Promise<Paginated>;
  beneficiarios(
    f: Pagination & {
      status?: string | undefined;
      grupoId?: string | undefined;
      dataAdmissaoInicio?: string | undefined;
      dataAdmissaoFim?: string | undefined;
    },
  ): Promise<Paginated>;
  estoque(
    f: Pagination & {
      insumo?: string | undefined;
      tipoMovimento?: string | undefined;
      dataInicio?: string | undefined;
      dataFim?: string | undefined;
    },
  ): Promise<Paginated>;
}
