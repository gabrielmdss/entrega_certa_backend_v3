export interface AuditoriaFilters {
  page: number;
  limit: number;
  usuarioId?: string | undefined;
  entidade?: string | undefined;
  entidadeId?: string | undefined;
  operacao?: string | undefined;
  dataInicio?: string | undefined;
  dataFim?: string | undefined;
}
export interface AuditoriaQueryPort {
  listar(filters: AuditoriaFilters): Promise<unknown>;
  obter(id: string): Promise<unknown | null>;
}
const sensitive =
  /(senha|password|secret|token|authorization|connection.?string|db_password|jwt)/i;
export function sanitizeAuditSnapshot(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAuditSnapshot);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !sensitive.test(key))
        .map(([key, item]) => [key, sanitizeAuditSnapshot(item)]),
    );
  return value;
}
