import type { Pool } from "pg";
import type {
  BeneficiarioDetail,
  BeneficiarioQueryPort,
} from "../../../../application/beneficiarios/ports/beneficiario-query.port.js";
import { maskDocument } from "../../../../shared/utils/mask-document.js";

type DetailRow = Omit<
  BeneficiarioDetail,
  | "dataAdmissao"
  | "pessoa"
  | "grupo"
  | "ultimaRetirada"
  | "direitoAtual"
  | "proximoDireito"
  | "pendenciasAtuais"
  | "historicoResumido"
> & {
  data_admissao: string;
  pessoa_id: string;
  nome_completo: string;
  data_nascimento: string | null;
  telefone: string | null;
  grupo_id: string | null;
  grupo_codigo: string | null;
  grupo_nome: string | null;
  documentos: Array<{ tipo: string; numero: string }>;
  foto: BeneficiarioDetail["pessoa"]["fotoPrincipal"];
  endereco: BeneficiarioDetail["pessoa"]["enderecoPrincipal"];
  ultima_retirada: BeneficiarioDetail["ultimaRetirada"];
  direito_atual: BeneficiarioDetail["direitoAtual"];
  proximo_direito: BeneficiarioDetail["proximoDireito"];
  pendencias: BeneficiarioDetail["pendenciasAtuais"];
  historico: BeneficiarioDetail["historicoResumido"];
};

export class PostgresBeneficiarioQuery implements BeneficiarioQueryPort {
  constructor(private readonly pool: Pool) {}
  async obterDetalhe(id: string): Promise<BeneficiarioDetail | null> {
    const row = (
      await this.pool.query<DetailRow>(BENEFICIARIO_DETAIL_SQL, [id])
    ).rows[0];
    if (!row) return null;
    return {
      id: row.id,
      status: row.status,
      dataAdmissao: row.data_admissao,
      pessoa: {
        id: row.pessoa_id,
        nomeCompleto: row.nome_completo,
        dataNascimento: row.data_nascimento,
        telefone: row.telefone,
        fotoPrincipal: row.foto,
        documentos: row.documentos.map((d) => ({
          tipo: d.tipo,
          numeroMascarado: maskDocument(d.numero, d.tipo),
        })),
        enderecoPrincipal: row.endereco,
      },
      grupo: row.grupo_id
        ? {
            id: row.grupo_id,
            codigo: row.grupo_codigo ?? "",
            nome: row.grupo_nome ?? "",
          }
        : null,
      ultimaRetirada: row.ultima_retirada,
      direitoAtual: row.direito_atual,
      proximoDireito: row.proximo_direito,
      pendenciasAtuais: row.pendencias,
      historicoResumido: row.historico,
    };
  }
}

export const BENEFICIARIO_DETAIL_SQL = `SELECT b.id::text,b.status,to_char(b.data_admissao,'YYYY-MM-DD') data_admissao,p.id::text pessoa_id,p.nome_completo,to_char(p.data_nascimento,'YYYY-MM-DD') data_nascimento,p.telefone,g.id::text grupo_id,g.codigo grupo_codigo,g.nome grupo_nome,
COALESCE((SELECT jsonb_agg(jsonb_build_object('tipo',td.codigo,'numero',pd.numero) ORDER BY pd.principal DESC,pd.id) FROM pastoral.pessoas_documentos pd JOIN pastoral.tipos_documento td ON td.id=pd.tipo_documento_id WHERE pd.pessoa_id=p.id AND pd.ativo),'[]') documentos,
(SELECT jsonb_build_object('storageKey',a.storage_key,'mimeType',a.mime_type) FROM pastoral.pessoas_arquivos pa JOIN pastoral.arquivos a ON a.id=pa.arquivo_id WHERE pa.pessoa_id=p.id AND pa.tipo='FOTO_PERFIL' AND pa.principal LIMIT 1) foto,
(SELECT jsonb_build_object('cep',pe.cep,'logradouro',pe.logradouro,'numero',pe.numero,'complemento',pe.complemento,'bairro',pe.bairro,'cidade',pe.cidade,'uf',trim(pe.uf)) FROM pastoral.pessoas_enderecos pe WHERE pe.pessoa_id=p.id AND pe.ativo ORDER BY pe.principal DESC,pe.id DESC LIMIT 1) endereco,
(SELECT jsonb_build_object('id',r.id::text,'ocorridoEm',r.ocorrido_em,'tipo',r.tipo) FROM pastoral.retiradas r WHERE r.beneficiario_id=b.id AND r.status='VALIDA' ORDER BY r.ocorrido_em DESC,r.id DESC LIMIT 1) ultima_retirada,
(SELECT jsonb_build_object('id',db.id::text,'competencia',concat(c.ano,'-',lpad(c.mes::text,2,'0')),'status',db.status,'distribuicaoPrevistaId',db.distribuicao_prevista_id::text,'dataPrevista',to_char(d.data_prevista,'YYYY-MM-DD')) FROM pastoral.direitos_beneficio db JOIN pastoral.competencias c ON c.id=db.competencia_id LEFT JOIN pastoral.distribuicoes d ON d.id=db.distribuicao_prevista_id WHERE db.beneficiario_id=b.id AND (c.ano*12+c.mes)<=extract(year from current_date)::int*12+extract(month from current_date)::int ORDER BY c.ano DESC,c.mes DESC LIMIT 1) direito_atual,
(SELECT jsonb_build_object('id',db.id::text,'competencia',concat(c.ano,'-',lpad(c.mes::text,2,'0')),'status',db.status,'distribuicaoPrevistaId',db.distribuicao_prevista_id::text,'dataPrevista',to_char(d.data_prevista,'YYYY-MM-DD')) FROM pastoral.direitos_beneficio db JOIN pastoral.competencias c ON c.id=db.competencia_id LEFT JOIN pastoral.distribuicoes d ON d.id=db.distribuicao_prevista_id WHERE db.beneficiario_id=b.id AND (c.ano*12+c.mes)>extract(year from current_date)::int*12+extract(month from current_date)::int ORDER BY c.ano,c.mes LIMIT 1) proximo_direito,
COALESCE((SELECT jsonb_agg(jsonb_build_object('codigo',x.status,'competencia',concat(x.ano,'-',lpad(x.mes::text,2,'0'))) ORDER BY x.ano DESC,x.mes DESC) FROM (SELECT db.status,c.ano,c.mes FROM pastoral.direitos_beneficio db JOIN pastoral.competencias c ON c.id=db.competencia_id WHERE db.beneficiario_id=b.id AND db.status IN ('AUSENTE','AUSENTE_NAO_JUSTIFICADO','NAO_ATENDIDO_IRREGULARIDADE')) x),'[]') pendencias,
COALESCE((SELECT jsonb_agg(jsonb_build_object('tipo',h.tipo,'ocorridoEm',h.ocorrido_em,'descricao',h.descricao) ORDER BY h.ocorrido_em DESC) FROM (SELECT 'RETIRADA' tipo,r.ocorrido_em,concat('Retirada ',r.tipo,' - ',r.status) descricao FROM pastoral.retiradas r WHERE r.beneficiario_id=b.id UNION ALL SELECT 'ALTERACAO_GRUPO',gh.vigencia_inicio,concat('Alteração de grupo para ',gd.nome) FROM pastoral.beneficiarios_grupos_historico gh JOIN pastoral.grupos_distribuicao gd ON gd.id=gh.grupo_destino_id WHERE gh.beneficiario_id=b.id ORDER BY ocorrido_em DESC LIMIT 5) h),'[]') historico
FROM pastoral.beneficiarios b JOIN pastoral.pessoas p ON p.id=b.pessoa_id LEFT JOIN pastoral.grupos_distribuicao g ON g.id=b.grupo_distribuicao_id WHERE b.id=$1`;
