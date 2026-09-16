import { createApp } from "./app.js";
import { env } from "./config.js";
import { dependencies } from "./dependencies.js";

async function bootstrap(): Promise<void> {
  await dependencies.postgresPool.query("SELECT 1");
  const server = createApp().listen(env.PORT, () =>
    dependencies.logger.info({ port: env.PORT }, "Pastoral API iniciada"),
  );
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    dependencies.logger.info({ signal }, "Encerrando aplicação");
    server.close(() => {
      void dependencies.postgresPool.end().then(() => (process.exitCode = 0));
    });
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
bootstrap().catch(async (error: unknown) => {
  dependencies.logger.fatal({ error }, "Falha ao iniciar aplicação");
  await dependencies.postgresPool.end();
  process.exitCode = 1;
});
