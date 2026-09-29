import { describe,expect,it,vi } from "vitest";
import { BuscarPessoasUseCase,CriarPessoaUseCase,ObterPessoaUseCase } from "../../../src/application/pessoas/use-cases/pessoas.use-cases.js";
import type { PessoaPort } from "../../../src/application/pessoas/ports/pessoa.port.js";
import { DomainError } from "../../../src/shared/errors/domain-error.js";
const person={id:"20",nomeCompleto:"Maria da Silva",dataNascimento:"1960-01-10",telefone:null,documentos:[{tipo:"CPF",numeroMascarado:"*********42"}],beneficiario:{id:"8",status:"ATIVO"}};
function port():PessoaPort{return{buscar:vi.fn().mockResolvedValue([person]),obter:vi.fn().mockResolvedValue(person),criar:vi.fn().mockResolvedValue({id:"20"}),salvarFotoPrincipal:vi.fn(),obterFotoPrincipal:vi.fn()};}
describe("pessoas",()=>{
  it("busca por nome no port",async()=>{const p=port();await new BuscarPessoasUseCase(p).execute({q:"maria"});expect(p.buscar).toHaveBeenCalledWith({q:"maria"});});
  it("busca por documento no port sem expor o número",async()=>{const p=port();const result=await new BuscarPessoasUseCase(p).execute({documento:"123"});expect(p.buscar).toHaveBeenCalledWith({documento:"123"});expect(result[0]?.documentos[0]?.numeroMascarado).toBe("*********42");});
  it("cria pessoa sem admitir beneficiário",async()=>{const p=port();const input={nomeCompleto:"Maria",dataNascimento:null,telefone:null,documentos:[{tipo:"CPF",numero:"12345678942",principal:true}],usuarioId:"1"};await expect(new CriarPessoaUseCase(p).execute(input)).resolves.toEqual({id:"20"});expect(p.criar).toHaveBeenCalledWith(input);});
  it("propaga conflito de documento duplicado",async()=>{const p=port();p.criar=vi.fn().mockRejectedValue(new DomainError("DOCUMENTO_DUPLICADO","Documento já cadastrado"));await expect(new CriarPessoaUseCase(p).execute({nomeCompleto:"Maria",dataNascimento:null,telefone:null,documentos:[{tipo:"CPF",numero:"123",principal:true}],usuarioId:"1"})).rejects.toMatchObject({code:"DOCUMENTO_DUPLICADO"});});
  it("obtém detalhe por id",async()=>{await expect(new ObterPessoaUseCase(port()).execute("20")).resolves.toEqual(person);});
});
