export type TipoRetirada =
  | "TITULAR"
  | "REPRESENTANTE"
  | "PRIMEIRA_ENTREGA"
  | "ANTECIPADA"
  | "CONTINGENCIA";
export type FormaIdentificacao =
  "DOCUMENTO" | "FOTO_HISTORICO" | "REPRESENTANTE" | "CONTINGENCIA";
export interface RepresentanteInput {
  nome: string;
  documento: string | null;
  relacao: string | null;
  autorizacaoDeclaratoria: boolean;
}
export interface RetiradaOutput {
  id: string;
  distribuicaoId: string;
  direitoId: string;
  beneficiario: { id: string; nomeCompleto: string };
  tipo: TipoRetirada;
  status: "VALIDA" | "ESTORNADA";
  formaIdentificacao: FormaIdentificacao | null;
  representante: {
    nome: string;
    documentoMascarado: string | null;
    relacao: string | null;
    autorizacaoDeclaratoria: boolean;
  } | null;
  operador: { id: string; login: string };
  ocorridoEm: string;
}
export interface RetiradaCommandPort {
  registrar(input: {
    distribuicaoId: string;
    beneficiarioId: string;
    tipo: TipoRetirada;
    formaIdentificacao: FormaIdentificacao | null;
    representante: RepresentanteInput | null;
    justificativaExcecao: string | null;
    usuarioId: string;
  }): Promise<{ id: string }>;
  obterContextoEstorno(
    id: string,
  ): Promise<{
    status: "VALIDA" | "ESTORNADA";
    operadorId: string;
    mesmoDia: boolean;
  } | null>;
  estornar(input: {
    retiradaId: string;
    motivo: string;
    usuarioId: string;
  }): Promise<void>;
}
export interface RetiradaQueryPort {
  listar(input: {
    distribuicaoId: string;
    beneficiarioId?: string | undefined;
    tipo?: TipoRetirada | undefined;
    status?: "VALIDA" | "ESTORNADA" | undefined;
  }): Promise<RetiradaOutput[]>;
  obter(id: string): Promise<RetiradaOutput | null>;
}
