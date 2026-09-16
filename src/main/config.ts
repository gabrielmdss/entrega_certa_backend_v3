import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string(),
  DB_SCHEMA: z.string().default("pastoral"),
  DB_SSL: z.coerce.boolean().default(false),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  DB_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  DB_LOCK_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  DB_SLOW_QUERY_MS: z.coerce.number().int().positive().default(500),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("8h"),
  FILES_STORAGE_PATH: z.string().default("./storage"),
  LOG_LEVEL: z.string().default("info"),
  CORS_ORIGINS: z.string().default("http://localhost:4200"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const keys = parsed.error.issues
    .map((issue) => issue.path.join("."))
    .join(", ");
  throw new Error(`Configuração de ambiente inválida: ${keys}`);
}

export const env = parsed.data;
export type DatabaseConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  poolMax: number;
  connectionTimeoutMs: number;
  idleTimeoutMs: number;
  statementTimeoutMs: number;
  lockTimeoutMs: number;
};
export const databaseConfig: DatabaseConfig = {
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  ssl: env.DB_SSL,
  poolMax: env.DB_POOL_MAX,
  connectionTimeoutMs: env.DB_CONNECTION_TIMEOUT_MS,
  idleTimeoutMs: env.DB_IDLE_TIMEOUT_MS,
  statementTimeoutMs: env.DB_STATEMENT_TIMEOUT_MS,
  lockTimeoutMs: env.DB_LOCK_TIMEOUT_MS,
};
