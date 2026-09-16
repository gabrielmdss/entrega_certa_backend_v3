import type { CapacidadePort } from '../ports/capacidade.port.js';
export class ObterCapacidadeUseCase{constructor(private readonly port:CapacidadePort){} execute(){return this.port.obter();}}
