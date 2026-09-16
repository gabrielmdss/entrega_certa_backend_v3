export interface PessoaDocumentoOutput {
  tipo: string;
  numeroMascarado: string;
}

export interface PessoaListItem {
  id: string;
  nomeCompleto: string;
  dataNascimento: string | null;
  documentos: PessoaDocumentoOutput[];
  beneficiario: { id: string; status: string } | null;
}

export interface PessoaDetail extends PessoaListItem {
  telefone: string | null;
}

export interface CriarPessoaInput {
  nomeCompleto: string;
  dataNascimento: string | null;
  telefone: string | null;
  documentos: Array<{ tipo: string; numero: string; principal: boolean }>;
  usuarioId: string;
}

export interface PessoaPort {
  buscar(filters: { q?: string; documento?: string }): Promise<PessoaListItem[]>;
  obter(id: string): Promise<PessoaDetail | null>;
  criar(input: CriarPessoaInput): Promise<{ id: string }>;
}
