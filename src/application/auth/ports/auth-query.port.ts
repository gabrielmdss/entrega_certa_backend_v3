export interface AuthenticatedUser {
  id: string; login: string; ativo: boolean; perfis: string[]; permissoes: string[];
}
export interface LoginUser extends AuthenticatedUser { senhaHash: string; }
export interface AuthQueryPort {
  findByLogin(login: string): Promise<LoginUser | null>;
  findById(id: string): Promise<AuthenticatedUser | null>;
  registerLogin(id: string): Promise<void>;
}
