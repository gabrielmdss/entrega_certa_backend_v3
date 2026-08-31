export interface AdmitirBeneficiarioCommand { pessoaId:string; grupoId:string; usuarioId:string; autorizarAcimaCapacidade:boolean; justificativaExcecao:string|null; }
export interface AlterarGrupoCommand { beneficiarioId:string; grupoDestinoId:string; vigenciaCompetenciaAtual:boolean; motivo:string; usuarioId:string; }
export interface BeneficiarioCommandPort {
  admitir(input:AdmitirBeneficiarioCommand):Promise<{id:string}>;
  desligar(input:{beneficiarioId:string;motivoId:string;observacao:string|null;usuarioId:string}):Promise<void>;
  reativar(input:{beneficiarioId:string;usuarioId:string}):Promise<void>;
  alterarGrupo(input:AlterarGrupoCommand):Promise<void>;
}
