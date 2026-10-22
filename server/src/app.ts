import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import authRoutes from "./routes/auth.routes";
import repositoryRoutes from "./routes/repository.routes";
import conversationRoutes from "./routes/conversation.routes";
import { rateLimit } from "./middleware/rate-limit.middleware";

const app = express();

const allowedOrigins = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(express.json({ limit: "100kb" }));
app.use(cors({ origin: allowedOrigins, credentials: true, allowedHeaders: ["Content-Type", "X-DevBrain-Request"] }));
app.use(helmet());
app.use(morgan("dev"));

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api", rateLimit(180, 15 * 60_000));
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/repositories", repositoryRoutes);
app.use("/api/v1/conversations", conversationRoutes);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "An unexpected error occurred.";
  const parserStatus = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : undefined;
  const status = parserStatus === 413 ? 413
    : parserStatus === 400 ? 400
    : /not found/i.test(message) ? 404
    : /valid|only public|too large|too long|between/i.test(message) ? 400
    : /rate limit/i.test(message) ? 429
    : /needs OPENAI_API_KEY/i.test(message) ? 503
    : 502;
  if (status >= 500) console.error("Request failed", { status, error: message });
  res.status(status).json({ error: status >= 500 && status !== 503 ? "A required upstream service failed. Please retry shortly." : message });
});

app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "DevBrain API",
  });
});

app.use((_req, res) => {
  res.status(404).json({ error: "Route not found." });
});

export default app;
