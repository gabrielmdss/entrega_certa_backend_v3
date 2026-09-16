import type { AlterarGrupoCommand,BeneficiarioCommandPort } from '../ports/beneficiario-command.port.js';
export class AlterarGrupoBeneficiarioUseCase{constructor(private readonly command:BeneficiarioCommandPort){} execute(input:AlterarGrupoCommand){return this.command.alterarGrupo(input);}}
