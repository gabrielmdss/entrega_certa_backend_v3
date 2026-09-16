import type { BeneficiarioCommandPort } from '../ports/beneficiario-command.port.js';
export class DesligarBeneficiarioUseCase{constructor(private readonly command:BeneficiarioCommandPort){} execute(input:{beneficiarioId:string;motivoId:string;observacao:string|null;usuarioId:string}){return this.command.desligar(input);}}
