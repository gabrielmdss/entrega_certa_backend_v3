export type CandidaturaStatus =
  | 'AGUARDANDO'
  | 'CONVOCADO'
  | 'ADMITIDO'
  | 'NAO_LOCALIZADO'
  | 'DESISTIU'
  | 'CANCELADO';

export function isCandidaturaAtiva(status: CandidaturaStatus): boolean {
  return status === 'AGUARDANDO' || status === 'CONVOCADO';
}
