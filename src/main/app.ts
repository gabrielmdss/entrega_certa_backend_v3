import express from "express";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { env } from "./config.js";
import { createRoutes } from "./routes.js";
import { errorHandler } from "../presentation/http/middlewares/error-handler.middleware.js";
import { dependencies } from "./dependencies.js";
import { requestContext } from "../presentation/http/middlewares/request-context.middleware.js";
import { openApiDocument } from "./openapi.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(requestContext(dependencies.logger));
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS.split(",").map((v) => v.trim()) }));
  app.use(express.json());
  app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));
  app.get("/ready", async (_req, res) => {
    try {
      await dependencies.postgresPool.query("SELECT 1");
      res.status(200).json({ status: "ready", database: "ok" });
    } catch {
      res.status(503).json({ status: "not_ready", database: "unavailable" });
    }
  });
  app.get("/openapi.json", (_req, res) => res.json(openApiDocument));
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
  app.use(createRoutes());
  app.use((_req, res) =>
    res
      .status(404)
      .json({
        error: { code: "ROTA_NAO_ENCONTRADA", message: "Rota não encontrada" },
      }),
  );
  app.use(errorHandler);
  return app;
}
