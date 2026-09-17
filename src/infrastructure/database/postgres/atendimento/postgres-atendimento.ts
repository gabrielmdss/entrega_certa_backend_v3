import type { Pool } from "pg";
import type {
  AtendimentoPort,
  CheckInOutput,
  PendenciaAtendimento,
  SituacaoOperacionalCheckIn,
} from "../../../../application/atendimento/ports/atendimento.port.js";
import { DomainError } from "../../../../shared/errors/domain-error.js";
export class PostgresAtendimento implements AtendimentoPort {
  constructor(private readonly pool: Pool) {}
  async buscarBeneficiarios(f: {
    nome?: string;
    documento?: string;
    status?: string;
    grupoId?: string;
  }) {
    const v: unknown[] = [];
    const w: string[] = [];
    if (f.nome) {
      v.push(`%${f.nome}%`);
      w.push(
        `p.nome_normalizado LIKE pastoral.fn_normalizar_texto($${v.length})`,
      );
    }
    if (f.documento) {
      v.push(f.documento);
      w.push(
        `EXISTS(SELECT 1 FROM pastoral.pessoas_documentos x WHERE x.pessoa_id=p.id AND x.ativo AND x.numero_normalizado=pastoral.fn_normalizar_documento($${v.length}))`,
      );
    }
    if (f.status) {
      v.push(f.status);
      w.push(`b.status=$${v.length}`);
    }
    if (f.grupoId) {
      v.push(f.grupoId);
      w.push(`b.grupo_distribuicao_id=$${v.length}`);
    }
    const r = await this.pool.query<{
      id: string;
      pessoa_id: string;
      nome_completo: string;
      status: string;
      grupo_id: string | null;
      codigo: string | null;
      documentos: string[];
      foto: { storageKey: string; mimeType: string | null } | null;
    }>(
      `SELECT b.id::text,p.id::text pessoa_id,p.nome_completo,b.status,g.id::text grupo_id,g.codigo,COALESCE(array_agg(DISTINCT pd.numero) FILTER(WHERE pd.id IS NOT NULL),'{}') documentos,(SELECT jsonb_build_object('storageKey',a.storage_key,'mimeType',a.mime_type) FROM pastoral.pessoas_arquivos pa JOIN pastoral.arquivos a ON a.id=pa.arquivo_id WHERE pa.pessoa_id=p.id AND pa.tipo='FOTO_PERFIL' AND pa.principal LIMIT 1) foto FROM pastoral.beneficiarios b JOIN pastoral.pessoas p ON p.id=b.pessoa_id LEFT JOIN pastoral.grupos_distribuicao g ON g.id=b.grupo_distribuicao_id LEFT JOIN pastoral.pessoas_documentos pd ON pd.pessoa_id=p.id AND pd.ativo ${w.length ? `WHERE ${w.join(" AND ")}` : ""} GROUP BY b.id,p.id,p.nome_completo,p.nome_normalizado,b.status,g.id,g.codigo ORDER BY p.nome_normalizado,b.id LIMIT 50`,
      v,
    );
    return r.rows.map((x) => ({
      id: x.id,
      pessoaId: x.pessoa_id,
      nomeCompleto: x.nome_completo,
      status: x.status,
      grupo: x.grupo_id ? { id: x.grupo_id, codigo: x.codigo } : null,
      fotoPrincipal: x.foto,
      documentos: x.documentos.map((numero) => ({
        tipo: "DOCUMENTO",
        numeroMascarado: mask(numero),
      })),
    }));
  }
  async registrarCheckIn(i: {
    distribuicaoId: string;
    beneficiarioId: string;
    usuarioId: string;
  }) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const context = await distribution(c, i.distribuicaoId);
      if (context.status !== "ABERTA")
        throw new DomainError(
          "DISTRIBUICAO_NAO_ABERTA",
          "Distribuição não está aberta",
        );
      const b = await c.query<{
        id: string;
        nome: string;
        status: string;
        grupo_id: string | null;
      }>(
        "SELECT b.id::text,p.nome_completo nome,b.status,b.grupo_distribuicao_id::text grupo_id FROM pastoral.beneficiarios b JOIN pastoral.pessoas p ON p.id=b.pessoa_id WHERE b.id=$1",
        [i.beneficiarioId],
      );
      const beneficiary = b.rows[0];
      if (!beneficiary)
        throw new DomainError(
          "BENEFICIARIO_NAO_ENCONTRADO",
          "Beneficiário não encontrado",
        );
      if (beneficiary.status !== "ATIVO")
        throw new DomainError(
          "BENEFICIARIO_DESLIGADO",
          "Beneficiário desligado",
        );
      if (
        (
          await c.query(
            "SELECT 1 FROM pastoral.distribuicoes_checkins WHERE distribuicao_id=$1 AND beneficiario_id=$2",
            [i.distribuicaoId, i.beneficiarioId],
          )
        ).rowCount
      )
        throw new DomainError("CHECKIN_JA_REALIZADO", "Check-in já realizado");
      const pendencias = await classify(
        c,
        context,
        i.beneficiarioId,
        beneficiary.grupo_id,
      );
      const classificacao = pendencias.length ? "PENDENTE" : "REGULAR";
      try {
        const r = await c.query<{ id: string; ocorrido_em: Date }>(
          "INSERT INTO pastoral.distribuicoes_checkins(distribuicao_id,beneficiario_id,classificacao_inicial,usuario_id) VALUES($1,$2,$3,$4) RETURNING id::text,ocorrido_em",
          [i.distribuicaoId, i.beneficiarioId, classificacao, i.usuarioId],
        );
        const row = r.rows[0];
        if (!row) throw new Error("Falha no check-in");
        await c.query("COMMIT");
        return output(
          row.id,
          row.ocorrido_em,
          beneficiary.id,
          beneficiary.nome,
          classificacao,
          pendencias,
          "AGUARDANDO",
          pendencias.length
            ? { podeRetirar: false, motivoBloqueio: "BENEFICIARIO_PENDENTE" }
            : { podeRetirar: true, motivoBloqueio: null },
        );
      } catch (e) {
        if (isUnique(e))
          throw new DomainError(
            "CHECKIN_JA_REALIZADO",
            "Check-in já realizado",
          );
        throw e;
      }
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async listarCheckIns(i: {
    distribuicaoId: string;
    classificacao?: "REGULAR" | "PENDENTE";
    situacao?: SituacaoOperacionalCheckIn;
  }) {
    const context = await distribution(this.pool, i.distribuicaoId);
    const v: unknown[] = [i.distribuicaoId];
    let extra = "";
    if (i.classificacao) {
      v.push(i.classificacao);
      extra = " AND ci.classificacao_inicial=$2";
    }
    const rows = (
      await this.pool.query<{
        id: string;
        beneficiario_id: string;
        nome: string;
        grupo_id: string | null;
        classificacao: "REGULAR" | "PENDENTE";
        retirada_valida: boolean;
        direito_status: string | null;
        distribuicao_prevista_id: string | null;
        ocorrido_em: Date;
      }>(
        `SELECT ci.id::text,ci.beneficiario_id::text,p.nome_completo nome,b.grupo_distribuicao_id::text grupo_id,ci.classificacao_inicial classificacao,ci.ocorrido_em,EXISTS(SELECT 1 FROM pastoral.retiradas r WHERE r.distribuicao_id=ci.distribuicao_id AND r.beneficiario_id=ci.beneficiario_id AND r.status='VALIDA') retirada_valida,db.status direito_status,db.distribuicao_prevista_id::text FROM pastoral.distribuicoes_checkins ci JOIN pastoral.beneficiarios b ON b.id=ci.beneficiario_id JOIN pastoral.pessoas p ON p.id=b.pessoa_id LEFT JOIN pastoral.direitos_beneficio db ON db.beneficiario_id=ci.beneficiario_id AND db.competencia_id=$${v.length + 1} AND db.tipo='REGULAR' WHERE ci.distribuicao_id=$1${extra} ORDER BY ci.ocorrido_em,ci.id`,
        [...v, context.competencia_id],
      )
    ).rows;
    const out: CheckInOutput[] = [];
    for (const r of rows) {
      const pendencias = await classify(
        this.pool,
        context,
        r.beneficiario_id,
        r.grupo_id,
      );
      out.push(
        output(
          r.id,
          r.ocorrido_em,
          r.beneficiario_id,
          r.nome,
          r.classificacao,
          pendencias,
          operationalSituation(r.retirada_valida, r.direito_status),
          withdrawalEligibility(
            r.retirada_valida,
            r.direito_status,
            r.distribuicao_prevista_id,
            context.id,
            pendencias,
          ),
        ),
      );
    }
    const hasEligibleRegularWaiting = out.some(
      (checkIn) =>
        checkIn.classificacao === "REGULAR" &&
        checkIn.situacaoOperacional === "AGUARDANDO" &&
        checkIn.podeRetirar,
    );
    const operational = out.map((checkIn) =>
      checkIn.classificacao === "PENDENTE" &&
      checkIn.situacaoOperacional === "AGUARDANDO" &&
      checkIn.podeRetirar &&
      hasEligibleRegularWaiting
        ? {
            ...checkIn,
            podeRetirar: false,
            motivoBloqueio: "REGULARES_AGUARDANDO",
          }
        : checkIn,
    );
    return i.situacao
      ? operational.filter(
          (checkIn) => checkIn.situacaoOperacional === i.situacao,
        )
      : operational;
  }
}
interface Dist {
  id: string;
  status: string;
  competencia_id: string;
  grupo_id: string;
  grupo_codigo: string;
}
async function distribution(db: { query: Pool["query"] }, id: string) {
  const r = await db.query<Dist>(
    "SELECT d.id::text,d.status,d.competencia_id::text,g.id::text grupo_id,g.codigo grupo_codigo FROM pastoral.distribuicoes d JOIN pastoral.grupos_distribuicao g ON g.id=d.grupo_distribuicao_id WHERE d.id=$1",
    [id],
  );
  if (!r.rows[0])
    throw new DomainError(
      "DISTRIBUICAO_NAO_ENCONTRADA",
      "Distribuição não encontrada",
    );
  return r.rows[0];
}
async function classify(
  db: { query: Pool["query"] },
  d: Dist,
  bid: string,
  recurringGroup: string | null,
): Promise<PendenciaAtendimento[]> {
  const p: PendenciaAtendimento[] = [];
  const right = await db.query<{ distribuicao_prevista_id: string | null }>(
    "SELECT distribuicao_prevista_id::text FROM pastoral.direitos_beneficio WHERE beneficiario_id=$1 AND competencia_id=$2 AND tipo='REGULAR'",
    [bid, d.competencia_id],
  );
  const planned = right.rows[0]?.distribuicao_prevista_id;
  if (planned !== d.id) {
    const g = await db.query<{ codigo: string }>(
      "SELECT g.codigo FROM pastoral.grupos_distribuicao g WHERE g.id=$1",
      [recurringGroup],
    );
    p.push({
      codigo: planned ? "GRUPO_DIFERENTE" : "DIREITO_NAO_ENCONTRADO",
      grupoEsperado: g.rows[0]?.codigo ?? "NAO_DEFINIDO",
    });
  }
  const prior = await db.query<{
    status: string;
    ano: number;
    mes: number;
    ausencia_status: string | null;
  }>(
    `SELECT db.status,c.ano::int,c.mes::int,a.status ausencia_status FROM pastoral.direitos_beneficio db JOIN pastoral.competencias c ON c.id=db.competencia_id JOIN pastoral.competencias atual ON atual.id=$2 LEFT JOIN pastoral.ausencias a ON a.direito_beneficio_id=db.id WHERE db.beneficiario_id=$1 AND (c.ano*12+c.mes)<(atual.ano*12+atual.mes) ORDER BY c.ano DESC,c.mes DESC LIMIT 1`,
    [bid, d.competencia_id],
  );
  const x = prior.rows[0];
  if (
    x &&
    [
      "AUSENTE",
      "AUSENTE_NAO_JUSTIFICADO",
      "NAO_ATENDIDO_IRREGULARIDADE",
    ].includes(x.status) &&
    x.ausencia_status !== "JUSTIFICADA"
  )
    p.push({
      codigo: "AUSENCIA_ANTERIOR_NAO_REGULARIZADA",
      competencia: `${x.ano}-${String(x.mes).padStart(2, "0")}`,
    });
  return p;
}
function output(
  id: string,
  date: Date,
  bid: string,
  nome: string,
  c: "REGULAR" | "PENDENTE",
  p: PendenciaAtendimento[],
  situacaoOperacional: SituacaoOperacionalCheckIn = "AGUARDANDO",
  eligibility: { podeRetirar: boolean; motivoBloqueio: string | null } = {
    podeRetirar: true,
    motivoBloqueio: null,
  },
): CheckInOutput {
  return {
    id,
    beneficiario: { id: bid, nomeCompleto: nome },
    classificacao: c,
    fila: c === "REGULAR" ? "PRINCIPAL" : "SECUNDARIA",
    situacaoOperacional,
    ...eligibility,
    pendencias: p,
    ocorridoEm: date.toISOString(),
  };
}
function withdrawalEligibility(
  validWithdrawal: boolean,
  rightStatus: string | null,
  plannedDistributionId: string | null,
  currentDistributionId: string,
  pending: PendenciaAtendimento[],
) {
  if (validWithdrawal)
    return { podeRetirar: false, motivoBloqueio: "DIREITO_JA_CONSUMIDO" };
  if (rightStatus !== "DISPONIVEL")
    return { podeRetirar: false, motivoBloqueio: "DIREITO_NAO_DISPONIVEL" };
  if (plannedDistributionId !== currentDistributionId)
    return { podeRetirar: false, motivoBloqueio: "DIREITO_NAO_DISPONIVEL" };
  if (pending.length)
    return { podeRetirar: false, motivoBloqueio: "BENEFICIARIO_PENDENTE" };
  return { podeRetirar: true, motivoBloqueio: null };
}
function operationalSituation(
  validWithdrawal: boolean,
  rightStatus: string | null,
): SituacaoOperacionalCheckIn {
  if (validWithdrawal) return "ATENDIDO";
  if (rightStatus === "NAO_ATENDIDO_ESTOQUE") return rightStatus;
  if (rightStatus === "NAO_ATENDIDO_IRREGULARIDADE") return rightStatus;
  return "AGUARDANDO";
}
function mask(v: string) {
  const s = v.replace(/\W/g, "");
  return `${"*".repeat(Math.max(0, s.length - 2))}${s.slice(-2)}`;
}
function isUnique(e: unknown) {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: unknown }).code === "23505"
  );
}
