export type MomentoJustificativa = "ANTES_DISTRIBUICAO" | "DEPOIS_DISTRIBUICAO";
export type DecisaoJustificativa = "ACEITA" | "REJEITADA";

export interface JustificativaCommandPort {
  registrar(input: {
    ausenciaId: string;
    descricao: string;
    momento: MomentoJustificativa;
    usuarioId: string;
  }): Promise<{ id: string }>;
  avaliar(input: {
    justificativaId: string;
    decisao: DecisaoJustificativa;
    observacao: string | null;
    usuarioId: string;
  }): Promise<void>;
}
