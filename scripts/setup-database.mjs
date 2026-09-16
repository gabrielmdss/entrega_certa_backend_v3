import "dotenv/config";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";

const connection = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
};
const dbName = process.env.DB_NAME;
if (!dbName) throw new Error("DB_NAME não configurado (.env)");

const admin = new pg.Pool({ ...connection, database: "postgres", max: 1 });
try {
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [dbName]);
  if (!exists.rowCount) {
    console.log(`Criando banco ${dbName}...`);
    await admin.query(`CREATE DATABASE "${dbName}"`);
  }
} finally {
  await admin.end();
}

const db = new pg.Pool({ ...connection, database: dbName, max: 1 });
try {
  const schemaExists = await db.query("SELECT 1 FROM pg_namespace WHERE nspname=$1", [
    process.env.DB_SCHEMA ?? "pastoral",
  ]);
  if (!schemaExists.rowCount) {
    console.log("Aplicando schema base (snapshot até 20260904)...");
    const snapshot = await readFile(
      new URL("../tests/integration/fixtures/pastoral-schema.sql", import.meta.url),
      "utf8",
    );
    await db.query(snapshot.replaceAll("CREATE EXTENSION ", "CREATE EXTENSION IF NOT EXISTS "));
  } else {
    console.log("Schema já existe, pulando snapshot base.");
  }

  const migrationsDir = new URL("../database/migrations/", import.meta.url);
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    // O snapshot base já inclui as migrations até 20260904.
    if (file < "20260905") continue;
    console.log(`Aplicando migration ${file}...`);
    await db.query(await readFile(new URL(file, migrationsDir), "utf8"));
  }
  console.log("Estrutura do banco pronta.");
} finally {
  await db.end();
}
