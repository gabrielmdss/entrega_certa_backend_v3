export interface ObterBeneficiarioOutput {
  id: string;
  pessoaId: string;
  status: 'ATIVO' | 'DESLIGADO';
  grupoDistribuicaoId: string | null;
}
