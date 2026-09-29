export interface PerfilResumo {
  id: string;
  codigo: string;
  nome: string;
}

export interface CriarUsuarioCommand {
  login: string;
  senhaHash: string;
  perfilIds: string[];
}

export interface UsuarioCriado {
  id: string;
  login: string;
  perfis: string[];
}

export interface UsuariosPort {
  listarPerfis(): Promise<PerfilResumo[]>;
  criar(input: CriarUsuarioCommand): Promise<UsuarioCriado>;
}
