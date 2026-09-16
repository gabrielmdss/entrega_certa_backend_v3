import type { Pool, PoolClient } from "pg";
import type {
  RetiradaCommandPort,
  RetiradaOutput,
  RetiradaQueryPort,
} from "../../../../application/atendimento/ports/retirada.port.js";
import { DomainError } from "../../../../shared/errors/domain-error.js";
type Register = Parameters<RetiradaCommandPort["registrar"]>[0];
export class PostgresRetirada
  implements RetiradaCommandPort, RetiradaQueryPort
{
  constructor(private readonly pool: Pool) {}
  async registrar(i: Register) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const d = (
        await c.query<{ status: string; competencia_id: string }>(
          "SELECT status,competencia_id::text FROM pastoral.distribuicoes WHERE id=$1 FOR UPDATE",
          [i.distribuicaoId],
        )
      ).rows[0];
      if (!d)
        throw new DomainError(
          "DISTRIBUICAO_NAO_ENCONTRADA",
          "Distribuição não encontrada",
        );
      if (d.status !== "ABERTA")
        throw new DomainError(
          "DISTRIBUICAO_NAO_ABERTA",
          "Distribuição não está aberta",
        );
      const b = (
        await c.query<{ status: string }>(
          "SELECT status FROM pastoral.beneficiarios WHERE id=$1",
          [i.beneficiarioId],
        )
      ).rows[0];
      if (!b)
        throw new DomainError(
          "BENEFICIARIO_NAO_ENCONTRADO",
          "Beneficiário não encontrado",
        );
      if (b.status !== "ATIVO")
        throw new DomainError(
          "BENEFICIARIO_DESLIGADO",
          "Beneficiário desligado",
        );
      const ci = (
        await c.query<{ classificacao: string }>(
          "SELECT classificacao_inicial classificacao FROM pastoral.distribuicoes_checkins WHERE distribuicao_id=$1 AND beneficiario_id=$2",
          [i.distribuicaoId, i.beneficiarioId],
        )
      ).rows[0];
      if (!ci)
        throw new DomainError("CHECKIN_OBRIGATORIO", "Check-in obrigatório");
      const direito = (
        await c.query<{
          id: string;
          status: string;
          distribuicao_prevista_id: string | null;
        }>(
          "SELECT id::text,status,distribuicao_prevista_id::text FROM pastoral.direitos_beneficio WHERE beneficiario_id=$1 AND competencia_id=$2 AND tipo='REGULAR' FOR UPDATE",
          [i.beneficiarioId, d.competencia_id],
        )
      ).rows[0];
      if (!direito)
        throw new DomainError(
          "DIREITO_NAO_ENCONTRADO",
          "Direito não encontrado",
        );
      if (direito.status !== "DISPONIVEL")
        throw new DomainError(
          direito.status === "RETIRADO"
            ? "DIREITO_JA_CONSUMIDO"
            : "DIREITO_NAO_DISPONIVEL",
          "Direito não disponível",
        );
      if (
        i.tipo !== "ANTECIPADA" &&
        direito.distribuicao_prevista_id !== i.distribuicaoId
      )
        throw new DomainError(
          "DIREITO_NAO_DISPONIVEL",
          "Direito previsto para outra distribuição",
        );
      if (await hasBlockingPending(c, i.beneficiarioId, d.competencia_id))
        throw new DomainError(
          "BENEFICIARIO_PENDENTE",
          "Pendência anterior não regularizada",
        );
      if (
        ci.classificacao === "PENDENTE" &&
        (await regularsWaiting(c, i.distribuicaoId, d.competencia_id))
      )
        throw new DomainError(
          "REGULARES_AGUARDANDO",
          "Existem regulares presentes aguardando",
        );
      let id: string;
      try {
        await c.query("SET LOCAL search_path TO pastoral,public");
        const r = await c.query<{ id: string }>(
          "SELECT pastoral.registrar_retirada($1,$2,$3,$4,$5)::text id",
          [
            direito.id,
            i.distribuicaoId,
            i.tipo,
            i.formaIdentificacao,
            i.usuarioId,
          ],
        );
        id = r.rows[0]?.id ?? "";
      } catch (e) {
        if (isUnique(e))
          throw new DomainError("DIREITO_JA_CONSUMIDO", "Direito já consumido");
        const message = e instanceof Error ? e.message : "Retirada inválida";
        if (message.includes("Cestas liberadas insuficientes"))
          throw new DomainError(
            "SEM_CESTA_DISPONIVEL",
            "Não há cesta liberada disponível",
          );
        throw new DomainError("RETIRADA_INVALIDA", message);
      }
      if (!id) throw new Error("Falha ao registrar retirada");
      if (i.representante)
        await c.query(
          "INSERT INTO pastoral.retiradas_representantes(retirada_id,nome,documento,relacao,autorizacao_declaratoria) VALUES($1,$2,$3,$4,$5)",
          [
            id,
            i.representante.nome,
            i.representante.documento,
            i.representante.relacao,
            i.representante.autorizacaoDeclaratoria,
          ],
        );
      await audit(
        c,
        i.usuarioId,
        "RETIRADA",
        id,
        "REGISTRO",
        null,
        { direitoId: direito.id, tipo: i.tipo, entregaFisica: true },
        i.justificativaExcecao,
      );
      await c.query("COMMIT");
      return { id };
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async obterContextoEstorno(id: string) {
    const r = await this.pool.query<{
      status: "VALIDA" | "ESTORNADA";
      operador_id: string;
      mesmo_dia: boolean;
    }>(
      `SELECT status,usuario_operador_id::text operador_id,(ocorrido_em AT TIME ZONE 'America/Sao_Paulo')::date=(now() AT TIME ZONE 'America/Sao_Paulo')::date mesmo_dia FROM pastoral.retiradas WHERE id=$1`,
      [id],
    );
    const x = r.rows[0];
    return x
      ? { status: x.status, operadorId: x.operador_id, mesmoDia: x.mesmo_dia }
      : null;
  }
  async estornar(i: { retiradaId: string; motivo: string; usuarioId: string }) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      // Mesma ordem do encerramento: distribuição antes da retirada/direito.
      await c.query(
        "SELECT d.id FROM pastoral.distribuicoes d JOIN pastoral.retiradas r ON r.distribuicao_id=d.id WHERE r.id=$1 FOR UPDATE OF d",
        [i.retiradaId],
      );
      const r = (
        await c.query<{ status: string; direito_id: string }>(
          "SELECT status,direito_beneficio_id::text direito_id FROM pastoral.retiradas WHERE id=$1 FOR UPDATE",
          [i.retiradaId],
        )
      ).rows[0];
      if (!r)
        throw new DomainError(
          "RETIRADA_NAO_ENCONTRADA",
          "Retirada não encontrada",
        );
      if (r.status !== "VALIDA")
        throw new DomainError("RETIRADA_JA_ESTORNADA", "Retirada já estornada");
      await c.query("SET LOCAL search_path TO pastoral,public");
      try {
        await c.query("SELECT pastoral.estornar_retirada($1,$2,$3)", [
          i.retiradaId,
          i.usuarioId,
          i.motivo,
        ]);
      } catch (e) {
        throw new DomainError(
          "ESTORNO_INVALIDO",
          e instanceof Error ? e.message : "Estorno inválido",
        );
      }
      await audit(
        c,
        i.usuarioId,
        "RETIRADA",
        i.retiradaId,
        "ESTORNO",
        { status: "VALIDA" },
        { status: "ESTORNADA", reversaoFisica: true },
        i.motivo,
      );
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async listar(i: Parameters<RetiradaQueryPort["listar"]>[0]) {
    const values: unknown[] = [i.distribuicaoId];
    const where = ["r.distribuicao_id=$1"];
    for (const [value, column] of [
      [i.beneficiarioId, "r.beneficiario_id"],
      [i.tipo, "r.tipo"],
      [i.status, "r.status"],
    ] as const)
      if (value) {
        values.push(value);
        where.push(`${column}=$${values.length}`);
      }
    return this.query(
      `WHERE ${where.join(" AND ")} ORDER BY r.ocorrido_em,r.id`,
      values,
    );
  }
  async obter(id: string) {
    return (await this.query("WHERE r.id=$1", [id]))[0] ?? null;
  }
  private async query(
    where: string,
    values: unknown[],
  ): Promise<RetiradaOutput[]> {
    const rows = (await this.pool.query<Row>(`${SELECT} ${where}`, values))
      .rows;
    return rows.map(map);
  }
}
async function hasBlockingPending(
  c: PoolClient,
  bid: string,
  competence: string,
) {
  return (
    (
      await c.query(
        `SELECT 1 FROM pastoral.direitos_beneficio db JOIN pastoral.competencias old ON old.id=db.competencia_id JOIN pastoral.competencias cur ON cur.id=$2 LEFT JOIN pastoral.ausencias a ON a.direito_beneficio_id=db.id WHERE db.beneficiario_id=$1 AND (old.ano*12+old.mes)<(cur.ano*12+cur.mes) AND db.status IN('AUSENTE','AUSENTE_NAO_JUSTIFICADO','NAO_ATENDIDO_IRREGULARIDADE') AND COALESCE(a.status,'SEM_JUSTIFICATIVA')<>'JUSTIFICADA' ORDER BY old.ano DESC,old.mes DESC LIMIT 1`,
        [bid, competence],
      )
    ).rowCount !== 0
  );
}
async function regularsWaiting(c: PoolClient, did: string, cid: string) {
  return (
    (
      await c.query(
        `SELECT 1 FROM pastoral.distribuicoes_checkins ci JOIN pastoral.direitos_beneficio db ON db.beneficiario_id=ci.beneficiario_id AND db.competencia_id=$2 AND db.tipo='REGULAR' WHERE ci.distribuicao_id=$1 AND ci.classificacao_inicial='REGULAR' AND db.status='DISPONIVEL' AND db.distribuicao_prevista_id=ci.distribuicao_id AND NOT EXISTS(SELECT 1 FROM pastoral.retiradas r WHERE r.distribuicao_id=ci.distribuicao_id AND r.beneficiario_id=ci.beneficiario_id AND r.status='VALIDA') LIMIT 1`,
        [did, cid],
      )
    ).rowCount !== 0
  );
}
async function audit(
  c: PoolClient,
  userId: string,
  entity: string,
  id: string,
  operation: string,
  before: unknown,
  after: unknown,
  reason: string | null,
) {
  await c.query(
    "INSERT INTO pastoral.auditoria(usuario_id,entidade,entidade_id,operacao,estado_anterior,estado_novo,motivo) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [userId, entity, id, operation, before, after, reason],
  );
}
function isUnique(e: unknown) {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: unknown }).code === "23505"
  );
}
interface Row {
  id: string;
  distribuicao_id: string;
  direito_id: string;
  beneficiario_id: string;
  nome: string;
  tipo: RetiradaOutput["tipo"];
  status: RetiradaOutput["status"];
  forma_identificacao: RetiradaOutput["formaIdentificacao"];
  rep_nome: string | null;
  rep_documento: string | null;
  rep_relacao: string | null;
  rep_autorizacao: boolean | null;
  operador_id: string;
  login: string;
  ocorrido_em: Date;
}
const SELECT = `SELECT r.id::text,r.distribuicao_id::text,r.direito_beneficio_id::text direito_id,r.beneficiario_id::text,p.nome_completo nome,r.tipo,r.status,r.forma_identificacao,rr.nome rep_nome,rr.documento rep_documento,rr.relacao rep_relacao,rr.autorizacao_declaratoria rep_autorizacao,u.id::text operador_id,u.login,r.ocorrido_em FROM pastoral.retiradas r JOIN pastoral.beneficiarios b ON b.id=r.beneficiario_id JOIN pastoral.pessoas p ON p.id=b.pessoa_id JOIN pastoral.usuarios u ON u.id=r.usuario_operador_id LEFT JOIN pastoral.retiradas_representantes rr ON rr.retirada_id=r.id`;
function map(x: Row): RetiradaOutput {
  return {
    id: x.id,
    distribuicaoId: x.distribuicao_id,
    direitoId: x.direito_id,
    beneficiario: { id: x.beneficiario_id, nomeCompleto: x.nome },
    tipo: x.tipo,
    status: x.status,
    formaIdentificacao: x.forma_identificacao,
    representante: x.rep_nome
      ? {
          nome: x.rep_nome,
          documentoMascarado: x.rep_documento ? mask(x.rep_documento) : null,
          relacao: x.rep_relacao,
          autorizacaoDeclaratoria: x.rep_autorizacao ?? false,
        }
      : null,
    operador: { id: x.operador_id, login: x.login },
    ocorridoEm: x.ocorrido_em.toISOString(),
  };
}
function mask(v: string) {
  const s = v.replace(/\W/g, "");
  return `${"*".repeat(Math.max(0, s.length - 2))}${s.slice(-2)}`;
}
