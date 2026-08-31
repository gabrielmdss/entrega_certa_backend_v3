import type { BeneficiarioCommandPort,AdmitirBeneficiarioCommand } from '../ports/beneficiario-command.port.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
export class AdmitirBeneficiarioUseCase { constructor(private readonly command:BeneficiarioCommandPort){}
 async execute(input:AdmitirBeneficiarioCommand & {permissoes:readonly string[]}) { if(input.autorizarAcimaCapacidade){if(!input.permissoes.includes('CAPACIDADE_ALTERAR'))throw new DomainError('PERMISSAO_NEGADA','Permissão para exceder capacidade negada');if(!input.justificativaExcecao?.trim())throw new DomainError('JUSTIFICATIVA_OBRIGATORIA','Justificativa da exceção é obrigatória');} return this.command.admitir(input); }}
