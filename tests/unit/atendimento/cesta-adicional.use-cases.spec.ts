import { describe, expect, it, vi } from "vitest";
import type { CestaAdicionalPort } from "../../../src/application/atendimento/ports/cesta-adicional.port.js";
import { AutorizarCestaAdicionalUseCase, EntregarCestaAdicionalUseCase, ListarCestasAdicionaisUseCase } from "../../../src/application/atendimento/use-cases/cesta-adicional.use-cases.js";

const output = { id:"1", beneficiario:{id:"2",nomeCompleto:"Maria"}, distribuicaoId:"3", modeloCesta:{id:"4",nome:"Especial"}, quantidade:1, justificativa:"necessidade", status:"AUTORIZADA" as const, autorizador:{id:"5",login:"responsavel"}, autorizadoEm:new Date().toISOString(), entrega:null };
const port: CestaAdicionalPort = { autorizar:vi.fn().mockResolvedValue(output), entregar:vi.fn().mockResolvedValue({...output,status:"ENTREGUE",entrega:{usuario:{id:"6",login:"atendimento"},entregueEm:new Date().toISOString()}}), listar:vi.fn().mockResolvedValue([output]) };

describe("cesta adicional", () => {
  it("autoriza preservando o comando explícito", async () => expect(new AutorizarCestaAdicionalUseCase(port).execute({beneficiarioId:"2",distribuicaoId:"3",modeloCestaId:"4",quantidade:1,justificativa:" necessidade ",usuarioId:"5"})).resolves.toMatchObject({status:"AUTORIZADA"}));
  it("entrega uma autorização", async () => expect(new EntregarCestaAdicionalUseCase(port).execute({cestaAdicionalId:"1",usuarioId:"6"})).resolves.toMatchObject({status:"ENTREGUE"}));
  it("lista por distribuição", async () => expect(new ListarCestasAdicionaisUseCase(port).execute("3")).resolves.toHaveLength(1));
});
