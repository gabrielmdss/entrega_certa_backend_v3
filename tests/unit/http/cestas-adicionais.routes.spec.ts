import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createDistribuicoesRouter } from "../../../src/presentation/http/distribuicoes/distribuicoes.routes.js";
import { createCestasAdicionaisRouter } from "../../../src/presentation/http/atendimento/cestas-adicionais.routes.js";
import { errorHandler } from "../../../src/presentation/http/middlewares/error-handler.middleware.js";

const controller = { autorizar:(_q:unknown,r:{status:(n:number)=>{json:(v:unknown)=>void}})=>r.status(201).json({data:{status:"AUTORIZADA"}}), listar:(_q:unknown,r:{json:(v:unknown)=>void})=>r.json({data:[]}), entregar:(_q:unknown,r:{json:(v:unknown)=>void})=>r.json({data:{status:"ENTREGUE"}}) };
const noop = (_q:unknown,r:{json:(v:unknown)=>void})=>r.json({data:null});
const distribution = {listar:noop,obter:noop,abrir:noop,encerrar:noop,remarcar:noop};
const attendance = {registrar:noop,listar:noop};
const operations = {registrarRetirada:noop,listarRetiradas:noop};
const authenticate = (permissions:string[]) => (_q:unknown,r:{locals:Record<string,unknown>},next:()=>void) => {r.locals.user={id:"1"};r.locals.permissions=permissions;next();};

describe("RBAC de cestas adicionais",()=>{
  it("exige CESTA_ADICIONAL_AUTORIZAR para autorização",async()=>{
    const app=express();app.use(express.json());app.use("/api/v1/distribuicoes",createDistribuicoesRouter(distribution as never,authenticate(["RETIRADA_REGISTRAR"]) as never,attendance as never,operations as never,controller as never));app.use(errorHandler);
    const response=await request(app).post("/api/v1/distribuicoes/3/cestas-adicionais").send({beneficiarioId:"2",modeloCestaId:"4",quantidade:1,justificativa:"teste"});
    expect(response.status).toBe(403);expect(response.body.error.code).toBe("PERMISSAO_NEGADA");
  });
  it("exige RETIRADA_REGISTRAR para entrega",async()=>{
    const app=express();app.use("/api/v1/cestas-adicionais",createCestasAdicionaisRouter(controller as never,authenticate(["CESTA_ADICIONAL_AUTORIZAR"]) as never));app.use(errorHandler);
    const response=await request(app).post("/api/v1/cestas-adicionais/1/entregar");
    expect(response.status).toBe(403);expect(response.body.error.code).toBe("PERMISSAO_NEGADA");
  });
});
