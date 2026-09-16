import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PostgresCestaAdicional } from "../../../src/infrastructure/database/postgres/atendimento/postgres-cesta-adicional.js";

describe("PostgresCestaAdicional", () => {
  it("autoriza usando a persistência existente", async () => {
    const query = vi.fn(async (sql:string) => {
      if (["BEGIN","COMMIT"].includes(sql)) return {rows:[],rowCount:null};
      if (sql.includes("FROM pastoral.distribuicoes WHERE")) return {rows:[{}],rowCount:1};
      if (sql.includes("FROM pastoral.beneficiarios WHERE")) return {rows:[{status:"ATIVO"}],rowCount:1};
      if (sql.includes("FROM pastoral.modelos_cesta WHERE")) return {rows:[{ativo:true}],rowCount:1};
      if (sql.includes("INSERT INTO pastoral.cestas_adicionais")) return {rows:[{id:"1"}],rowCount:1};
      if (sql.includes("FROM pastoral.cestas_adicionais ca")) return {rows:[row("AUTORIZADA")],rowCount:1};
      throw new Error(`Query inesperada: ${sql}`);
    });
    const client={query,release:vi.fn()};
    const adapter=new PostgresCestaAdicional({connect:vi.fn().mockResolvedValue(client)} as unknown as Pool);
    await expect(adapter.autorizar({beneficiarioId:"2",distribuicaoId:"3",modeloCestaId:"4",quantidade:1,justificativa:"necessidade",usuarioId:"5"})).resolves.toMatchObject({id:"1",status:"AUTORIZADA"});
    expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO pastoral.cestas_adicionais"),["2","3","4",1,"necessidade","5"]);
  });

  it("delega estoque e transição da entrega à função PostgreSQL", async () => {
    const query = vi.fn(async (sql:string) => {
      if (["BEGIN","COMMIT","SET LOCAL search_path TO pastoral,public"].includes(sql)) return {rows:[],rowCount:null};
      if (sql.includes("entregar_cesta_adicional")) return {rows:[{entregar_cesta_adicional:"9"}],rowCount:1};
      if (sql.includes("FROM pastoral.cestas_adicionais ca")) return {rows:[row("ENTREGUE")],rowCount:1};
      throw new Error(`Query inesperada: ${sql}`);
    });
    const client={query,release:vi.fn()};
    const adapter=new PostgresCestaAdicional({connect:vi.fn().mockResolvedValue(client)} as unknown as Pool);
    await expect(adapter.entregar({cestaAdicionalId:"1",usuarioId:"6"})).resolves.toMatchObject({status:"ENTREGUE"});
    expect(query).toHaveBeenCalledWith("SELECT pastoral.entregar_cesta_adicional($1,$2)",["1","6"]);
  });

  it("mapeia transição inválida sem duplicar a regra", async () => {
    const query=vi.fn(async(sql:string)=>{if(sql==="BEGIN"||sql==="ROLLBACK"||sql.startsWith("SET LOCAL"))return {rows:[],rowCount:null};if(sql.includes("entregar_cesta_adicional"))throw new Error("Cesta adicional não está autorizada");throw new Error(`Query inesperada: ${sql}`);});
    const adapter=new PostgresCestaAdicional({connect:vi.fn().mockResolvedValue({query,release:vi.fn()})} as unknown as Pool);
    await expect(adapter.entregar({cestaAdicionalId:"1",usuarioId:"6"})).rejects.toMatchObject({code:"CESTA_ADICIONAL_NAO_AUTORIZADA"});
  });
});

function row(status:"AUTORIZADA"|"ENTREGUE") { return {id:"1",beneficiario_id:"2",nome:"Maria",distribuicao_id:"3",modelo_id:"4",modelo_nome:"Especial",quantidade:1,justificativa:"necessidade",status,autorizador_id:"5",autorizador_login:"responsavel",autorizado_em:new Date(),entrega_usuario_id:status==="ENTREGUE"?"6":null,entrega_login:status==="ENTREGUE"?"atendimento":null,entregue_em:status==="ENTREGUE"?new Date():null}; }
