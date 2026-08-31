import type { CapacidadePort } from '../ports/capacidade.port.js';
export class AlterarCapacidadeUseCase{constructor(private readonly port:CapacidadePort){} execute(input:{capacidade:number;justificativa:string;usuarioId:string}){return this.port.alterar(input);}}
