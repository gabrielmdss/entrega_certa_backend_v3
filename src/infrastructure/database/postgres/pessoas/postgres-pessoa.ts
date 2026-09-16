import type { Pool, PoolClient } from "pg";
import type { CriarPessoaInput, PessoaDetail, PessoaListItem, PessoaPort } from "../../../../application/pessoas/ports/pessoa.port.js";
import { DomainError } from "../../../../shared/errors/domain-error.js";
import { maskDocument } from "../../../../shared/utils/mask-document.js";

interface PessoaRow {
  id: string;
  nome_completo: string;
  data_nascimento: string | null;
  telefone: string | null;
  documentos: Array<{ tipo: string; numero: string }>;
  beneficiario_id: string | null;
  beneficiario_status: string | null;
}

const SELECT = `SELECT p.id::text,p.nome_completo,to_char(p.data_nascimento,'YYYY-MM-DD') data_nascimento,p.telefone,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('tipo',td.codigo,'numero',pd.numero) ORDER BY pd.principal DESC,pd.id)
    FROM pastoral.pessoas_documentos pd JOIN pastoral.tipos_documento td ON td.id=pd.tipo_documento_id
    WHERE pd.pessoa_id=p.id AND pd.ativo),'[]'::jsonb) documentos,
  b.id::text beneficiario_id,b.status beneficiario_status
  FROM pastoral.pessoas p LEFT JOIN pastoral.beneficiarios b ON b.pessoa_id=p.id`;

export class PostgresPessoa implements PessoaPort {
  constructor(private readonly pool: Pool) {}

  async buscar(filters: { q?: string; documento?: string }): Promise<PessoaListItem[]> {
    const values: unknown[] = [];
    const where = ["p.ativo"];
    if (filters.q) {
      values.push(`%${filters.q}%`);
      where.push(`p.nome_normalizado LIKE pastoral.fn_normalizar_texto($${values.length})`);
    }
    if (filters.documento) {
      values.push(filters.documento);
      where.push(`EXISTS (SELECT 1 FROM pastoral.pessoas_documentos px WHERE px.pessoa_id=p.id AND px.ativo AND px.numero_normalizado=pastoral.fn_normalizar_documento($${values.length}))`);
    }
    const result = await this.pool.query<PessoaRow>(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY p.nome_normalizado,p.id LIMIT 50`, values);
    return result.rows.map(mapPessoa);
  }

  async obter(id: string): Promise<PessoaDetail | null> {
    const row = (await this.pool.query<PessoaRow>(`${SELECT} WHERE p.id=$1`, [id])).rows[0];
    return row ? mapPessoa(row) : null;
  }

  async criar(input: CriarPessoaInput): Promise<{ id: string }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.ensureDocumentsAvailable(client, input.documentos);
      const person = await client.query<{ id: string }>(
        "INSERT INTO pastoral.pessoas(nome_completo,data_nascimento,telefone) VALUES($1,$2,$3) RETURNING id::text",
        [input.nomeCompleto, input.dataNascimento, input.telefone],
      );
      const id = person.rows[0]?.id;
      if (!id) throw new Error("Falha ao criar pessoa");
      for (const document of input.documentos) {
        const type = await client.query<{ id: string }>("SELECT id::text FROM pastoral.tipos_documento WHERE codigo=$1 AND ativo", [document.tipo]);
        const typeId = type.rows[0]?.id;
        if (!typeId) throw new DomainError("TIPO_DOCUMENTO_INVALIDO", `Tipo de documento inválido: ${document.tipo}`);
        await client.query("INSERT INTO pastoral.pessoas_documentos(pessoa_id,tipo_documento_id,numero,principal) VALUES($1,$2,$3,$4)", [id, typeId, document.numero, document.principal]);
      }
      await client.query("INSERT INTO pastoral.auditoria(usuario_id,entidade,entidade_id,operacao,estado_novo) VALUES($1,'PESSOA',$2,'CRIACAO',jsonb_build_object('nomeCompleto',$3))", [input.usuarioId, id, input.nomeCompleto]);
      await client.query("COMMIT");
      return { id };
    } catch (error) {
      await client.query("ROLLBACK");
      if (isUnique(error)) throw new DomainError("DOCUMENTO_DUPLICADO", "Documento já cadastrado");
      throw error;
    } finally { client.release(); }
  }

  private async ensureDocumentsAvailable(client: PoolClient, documents: CriarPessoaInput["documentos"]) {
    for (const document of documents) {
      const duplicate = await client.query("SELECT 1 FROM pastoral.pessoas_documentos WHERE ativo AND numero_normalizado=pastoral.fn_normalizar_documento($1)", [document.numero]);
      if (duplicate.rowCount) throw new DomainError("DOCUMENTO_DUPLICADO", "Documento já cadastrado");
    }
  }
}

function mapPessoa(row: PessoaRow): PessoaDetail {
  return {
    id: row.id,
    nomeCompleto: row.nome_completo,
    dataNascimento: row.data_nascimento,
    telefone: row.telefone,
    documentos: row.documentos.map((document) => ({ tipo: document.tipo, numeroMascarado: maskDocument(document.numero, document.tipo) })),
    beneficiario: row.beneficiario_id ? { id: row.beneficiario_id, status: row.beneficiario_status ?? "" } : null,
  };
}

function isUnique(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "23505";
}
