import type { Pool, PoolClient } from "pg";
import type { CestaAdicionalOutput, CestaAdicionalPort, CestaAdicionalStatus } from "../../../../application/atendimento/ports/cesta-adicional.port.js";
import { DomainError } from "../../../../shared/errors/domain-error.js";

export class PostgresCestaAdicional implements CestaAdicionalPort {
  constructor(private readonly pool: Pool) {}

  async autorizar(input: Parameters<CestaAdicionalPort["autorizar"]>[0]) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await ensureAuthorizationReferences(client, input);
      const result = await client.query<{ id: string }>(
        `INSERT INTO pastoral.cestas_adicionais(beneficiario_id,distribuicao_id,modelo_cesta_id,quantidade,justificativa,usuario_autorizador_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id::text`,
        [input.beneficiarioId, input.distribuicaoId, input.modeloCestaId, input.quantidade, input.justificativa, input.usuarioId],
      );
      const id = result.rows[0]?.id;
      if (!id) throw new Error("Falha ao autorizar cesta adicional");
      const output = await findById(client, id);
      await client.query("COMMIT");
      if (!output) throw new Error("Falha ao consultar cesta adicional autorizada");
      return output;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async entregar(input: Parameters<CestaAdicionalPort["entregar"]>[0]) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL search_path TO pastoral,public");
      try {
        await client.query("SELECT pastoral.entregar_cesta_adicional($1,$2)", [input.cestaAdicionalId, input.usuarioId]);
      } catch (error) {
        throw mapDeliveryError(error);
      }
      const output = await findById(client, input.cestaAdicionalId);
      await client.query("COMMIT");
      if (!output) throw new DomainError("CESTA_ADICIONAL_NAO_ENCONTRADA", "Cesta adicional não encontrada");
      return output;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listar(distribuicaoId: string) {
    const result = await this.pool.query<Row>(`${SELECT} WHERE ca.distribuicao_id=$1 ORDER BY ca.autorizado_em,ca.id`, [distribuicaoId]);
    return result.rows.map(map);
  }
}

async function ensureAuthorizationReferences(client: PoolClient, input: Parameters<CestaAdicionalPort["autorizar"]>[0]) {
  const distribution = await client.query<{status: string}>("SELECT status FROM pastoral.distribuicoes WHERE id=$1 FOR UPDATE", [input.distribuicaoId]);
  if (!distribution.rowCount) throw new DomainError("DISTRIBUICAO_NAO_ENCONTRADA", "Distribuição não encontrada");
  if (distribution.rows[0]?.status === "ENCERRADA") throw new DomainError("DISTRIBUICAO_ENCERRADA", "Distribuição encerrada");
  const beneficiary = await client.query<{ status: string }>("SELECT status FROM pastoral.beneficiarios WHERE id=$1", [input.beneficiarioId]);
  if (!beneficiary.rows[0]) throw new DomainError("BENEFICIARIO_NAO_ENCONTRADO", "Beneficiário não encontrado");
  if (beneficiary.rows[0].status !== "ATIVO") throw new DomainError("BENEFICIARIO_DESLIGADO", "Beneficiário desligado");
  const model = await client.query<{ ativo: boolean }>("SELECT ativo FROM pastoral.modelos_cesta WHERE id=$1", [input.modeloCestaId]);
  if (!model.rows[0]) throw new DomainError("MODELO_CESTA_NAO_ENCONTRADO", "Modelo de cesta não encontrado");
  if (!model.rows[0].ativo) throw new DomainError("MODELO_CESTA_INATIVO", "Modelo de cesta inativo");
}

async function findById(db: Pick<PoolClient, "query">, id: string) {
  const result = await db.query<Row>(`${SELECT} WHERE ca.id=$1`, [id]);
  return result.rows[0] ? map(result.rows[0]) : null;
}

function mapDeliveryError(error: unknown) {
  const message = error instanceof Error ? error.message : "Entrega de cesta adicional inválida";
  if (message.includes("não encontrada")) return new DomainError("CESTA_ADICIONAL_NAO_ENCONTRADA", "Cesta adicional não encontrada");
  if (message.includes("não está autorizada")) return new DomainError("CESTA_ADICIONAL_NAO_AUTORIZADA", "Cesta adicional não está autorizada");
  if (message.includes("Distribuição não está aberta")) return new DomainError("DISTRIBUICAO_NAO_ABERTA", "Distribuição não está aberta");
  if (message.includes("Cestas liberadas insuficientes")) return new DomainError("SEM_CESTA_DISPONIVEL", "Não há cestas liberadas suficientes");
  return new DomainError("ENTREGA_CESTA_ADICIONAL_INVALIDA", message);
}

interface Row { id:string; beneficiario_id:string; nome:string; distribuicao_id:string; modelo_id:string; modelo_nome:string; quantidade:number; justificativa:string; status:CestaAdicionalStatus; autorizador_id:string; autorizador_login:string; autorizado_em:Date; entrega_usuario_id:string|null; entrega_login:string|null; entregue_em:Date|null }
const SELECT = `SELECT ca.id::text,ca.beneficiario_id::text,p.nome_completo nome,ca.distribuicao_id::text,ca.modelo_cesta_id::text modelo_id,m.nome modelo_nome,ca.quantidade,ca.justificativa,ca.status,ua.id::text autorizador_id,ua.login autorizador_login,ca.autorizado_em,ue.id::text entrega_usuario_id,ue.login entrega_login,ca.entregue_em FROM pastoral.cestas_adicionais ca JOIN pastoral.beneficiarios b ON b.id=ca.beneficiario_id JOIN pastoral.pessoas p ON p.id=b.pessoa_id JOIN pastoral.modelos_cesta m ON m.id=ca.modelo_cesta_id JOIN pastoral.usuarios ua ON ua.id=ca.usuario_autorizador_id LEFT JOIN pastoral.usuarios ue ON ue.id=ca.usuario_entrega_id`;
function map(row: Row): CestaAdicionalOutput { return { id:row.id, beneficiario:{id:row.beneficiario_id,nomeCompleto:row.nome}, distribuicaoId:row.distribuicao_id, modeloCesta:{id:row.modelo_id,nome:row.modelo_nome}, quantidade:row.quantidade, justificativa:row.justificativa, status:row.status, autorizador:{id:row.autorizador_id,login:row.autorizador_login}, autorizadoEm:row.autorizado_em.toISOString(), entrega:row.entrega_usuario_id&&row.entrega_login&&row.entregue_em?{usuario:{id:row.entrega_usuario_id,login:row.entrega_login},entregueEm:row.entregue_em.toISOString()}:null }; }
