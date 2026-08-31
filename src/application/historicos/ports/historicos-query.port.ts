export interface HistoricosQueryPort {
  beneficiario(id: string): Promise<unknown | null>;
  distribuicao(id: string): Promise<unknown | null>;
}
