import type { Pool } from 'pg';
import type { AuthQueryPort, AuthenticatedUser, LoginUser } from '../../../../application/auth/ports/auth-query.port.js';

interface UserRow { id: string; login: string; ativo: boolean; senha_hash?: string; perfis: string[]; permissoes: string[]; }
const USER_SELECT = `SELECT u.id::text, u.login, u.ativo, u.senha_hash,
  COALESCE(array_agg(DISTINCT p.codigo) FILTER (WHERE p.id IS NOT NULL AND p.ativo), '{}') AS perfis,
  COALESCE(array_agg(DISTINCT pe.codigo) FILTER (WHERE pe.id IS NOT NULL AND p.ativo), '{}') AS permissoes
  FROM pastoral.usuarios u LEFT JOIN pastoral.usuarios_perfis up ON up.usuario_id=u.id
  LEFT JOIN pastoral.perfis p ON p.id=up.perfil_id LEFT JOIN pastoral.perfis_permissoes pp ON pp.perfil_id=p.id
  LEFT JOIN pastoral.permissoes pe ON pe.id=pp.permissao_id`;

export class PostgresAuthQuery implements AuthQueryPort {
  constructor(private readonly db: Pool) {}
  async findByLogin(login: string): Promise<LoginUser | null> {
    const result = await this.db.query<UserRow & { senha_hash: string }>(`${USER_SELECT} WHERE lower(u.login)=lower($1)
      GROUP BY u.id,u.login,u.ativo,u.senha_hash`, [login]);
    const row=result.rows[0]; return row ? { ...map(row), senhaHash: row.senha_hash } : null;
  }
  async findById(id: string): Promise<AuthenticatedUser | null> {
    const result = await this.db.query<UserRow>(`${USER_SELECT} WHERE u.id=$1 GROUP BY u.id,u.login,u.ativo,u.senha_hash`, [id]);
    const row=result.rows[0]; return row ? map(row) : null;
  }
  async registerLogin(id: string): Promise<void> { await this.db.query('UPDATE pastoral.usuarios SET ultimo_login_em=now(), atualizado_em=now() WHERE id=$1',[id]); }
}
function map(row: UserRow): AuthenticatedUser { return { id:row.id, login:row.login, ativo:row.ativo, perfis:row.perfis, permissoes:row.permissoes }; }
