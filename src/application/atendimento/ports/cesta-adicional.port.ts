export type CestaAdicionalStatus = "AUTORIZADA" | "ENTREGUE" | "CANCELADA";

export interface CestaAdicionalOutput {
  id: string;
  beneficiario: { id: string; nomeCompleto: string };
  distribuicaoId: string;
  modeloCesta: { id: string; nome: string };
  quantidade: number;
  justificativa: string;
  status: CestaAdicionalStatus;
  autorizador: { id: string; login: string };
  autorizadoEm: string;
  entrega: { usuario: { id: string; login: string }; entregueEm: string } | null;
}

export interface CestaAdicionalPort {
  autorizar(input: {
    beneficiarioId: string;
    distribuicaoId: string;
    modeloCestaId: string;
    quantidade: number;
    justificativa: string;
    usuarioId: string;
  }): Promise<CestaAdicionalOutput>;
  entregar(input: { cestaAdicionalId: string; usuarioId: string }): Promise<CestaAdicionalOutput>;
  listar(distribuicaoId: string): Promise<CestaAdicionalOutput[]>;
}
