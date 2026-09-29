import type { Pool } from "pg";
import type {
  CriarUsuarioCommand,
  PerfilResumo,
  UsuarioCriado,
  UsuariosPort,
} from "../../../../application/admin/ports/usuarios.port.js";
import { DomainError } from "../../../../shared/errors/domain-error.js";

export class PostgresUsuarios implements UsuariosPort {
  constructor(private readonly pool: Pool) {}

  async listarPerfis(): Promise<PerfilResumo[]> {
    return (
      await this.pool.query(
        "SELECT id::text,codigo,nome FROM pastoral.perfis WHERE ativo ORDER BY nome",
      )
    ).rows;
  }

  async criar(input: CriarUsuarioCommand): Promise<UsuarioCriado> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const perfis = await client.query<{ id: string; codigo: string }>(
        "SELECT id::text,codigo FROM pastoral.perfis WHERE id = ANY($1) AND ativo",
        [input.perfilIds],
      );
      if (perfis.rowCount !== input.perfilIds.length)
        throw new DomainError("PERFIL_NAO_ENCONTRADO", "Perfil não encontrado");
      const usuario = await client.query<{ id: string }>(
        "INSERT INTO pastoral.usuarios(login,senha_hash,ativo) VALUES($1,$2,true) RETURNING id::text",
        [input.login, input.senhaHash],
      );
      const id = usuario.rows[0]?.id;
      if (!id) throw new Error("Falha ao criar usuário");
      for (const perfilId of input.perfilIds)
        await client.query(
          "INSERT INTO pastoral.usuarios_perfis(usuario_id,perfil_id) VALUES($1,$2)",
          [id, perfilId],
        );
      await client.query("COMMIT");
      return { id, login: input.login, perfis: perfis.rows.map((p) => p.codigo) };
    } catch (error) {
      await client.query("ROLLBACK");
      if (isUniqueViolation(error))
        throw new DomainError("LOGIN_JA_EXISTE", "Login já cadastrado");
      throw error;
    } finally {
      client.release();
    }
  }
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "23505"
  );
}
