import type { BeneficiarioCommandPort } from '../ports/beneficiario-command.port.js';
export class ReativarBeneficiarioUseCase{constructor(private readonly command:BeneficiarioCommandPort){} execute(input:{beneficiarioId:string;usuarioId:string}){return this.command.reativar(input);}}
