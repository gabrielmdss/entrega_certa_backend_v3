import type { CriarPessoaInput, PessoaPort } from "../ports/pessoa.port.js";
import { DomainError } from "../../../shared/errors/domain-error.js";

export class BuscarPessoasUseCase {
  constructor(private readonly port: PessoaPort) {}
  execute(filters: { q?: string; documento?: string }) { return this.port.buscar(filters); }
}

export class ObterPessoaUseCase {
  constructor(private readonly port: PessoaPort) {}
  async execute(id: string) {
    const pessoa = await this.port.obter(id);
    if (!pessoa) throw new DomainError("PESSOA_NAO_ENCONTRADA", "Pessoa não encontrada");
    return pessoa;
  }
}

export class CriarPessoaUseCase {
  constructor(private readonly port: PessoaPort) {}
  execute(input: CriarPessoaInput) { return this.port.criar(input); }
}
