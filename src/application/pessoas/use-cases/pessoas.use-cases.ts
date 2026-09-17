import type { CriarPessoaInput, PessoaPort, SalvarFotoPessoaInput } from "../ports/pessoa.port.js";
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

export class UploadFotoPessoaUseCase {
  constructor(private readonly port: PessoaPort) {}
  execute(input: SalvarFotoPessoaInput) { return this.port.salvarFotoPrincipal(input); }
}

export class ObterFotoPessoaUseCase {
  constructor(private readonly port: PessoaPort) {}
  async execute(pessoaId: string) {
    const foto = await this.port.obterFotoPrincipal(pessoaId);
    if (!foto) throw new DomainError("FOTO_NAO_ENCONTRADA", "Pessoa sem foto cadastrada");
    return foto;
  }
}
