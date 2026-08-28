export type BeneficiarioStatus = 'ATIVO' | 'DESLIGADO';

export class Beneficiario {
  constructor(
    public readonly id: string,
    public readonly pessoaId: string,
    private status: BeneficiarioStatus,
    private grupoDistribuicaoId: string | null,
  ) {}

  isAtivo(): boolean { return this.status === 'ATIVO'; }
  getStatus(): BeneficiarioStatus { return this.status; }
  getGrupoDistribuicaoId(): string | null { return this.grupoDistribuicaoId; }
}
