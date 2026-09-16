import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { Pool } from "pg";

/** Creates a new database, never a schema inside the configured application DB. */
export default async function setup() {
  const name = `pastoral_test_${randomUUID().replaceAll("-", "")}`;
  if (!/^pastoral_test_[a-f0-9]{32}$/.test(name))
    throw new Error("Nome de teste inválido");
  const connection = {
    host: process.env.TEST_DB_ADMIN_HOST ?? process.env.DB_HOST,
    port: Number(process.env.TEST_DB_ADMIN_PORT ?? process.env.DB_PORT ?? 5432),
    user: process.env.TEST_DB_ADMIN_USER ?? process.env.DB_USER,
    password: process.env.TEST_DB_ADMIN_PASSWORD ?? process.env.DB_PASSWORD,
    connectionTimeoutMillis: 5000,
  };
  const admin = new Pool({ ...connection, database: "postgres", max: 1 });
  let created = false;
  const cleanup = async () => {
    try {
      // Only this run's randomly named database can reach DROP DATABASE.
      if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  };
  try {
    await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
    created = true;
    const db = new Pool({ ...connection, database: name, max: 1 });
    try {
      await db.query(
        await readFile(
          new URL("./fixtures/pastoral-schema.sql", import.meta.url),
          "utf8",
        ),
      );
      const directory = new URL("../../database/migrations/", import.meta.url);
      for (const file of (await readdir(directory)).sort()) {
        // The snapshot already includes migrations through 20260904.
        if (file.endsWith(".sql") && file >= "20260905")
          await db.query(await readFile(new URL(file, directory), "utf8"));
      }
    } finally {
      await db.end();
    }
    process.env.DB_HOST = connection.host ?? "localhost";
    process.env.DB_PORT = String(connection.port);
    process.env.DB_USER = connection.user ?? "postgres";
    process.env.DB_PASSWORD = connection.password ?? "";
    process.env.DB_NAME = name;
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = randomUUID() + randomUUID();
    process.env.LOG_LEVEL = "silent";
    process.env.PASTORAL_TEST_DATABASE = name;
    return cleanup;
  } catch (error) {
    await cleanup();
    throw error;
  }
}
