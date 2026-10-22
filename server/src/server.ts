import path from "node:path";
import { config as loadEnv } from "dotenv";
import app from "./app";

loadEnv({ path: path.resolve(__dirname, "../.env") });

const PORT = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const server = app.listen(PORT, () => {
  console.log(`DevBrain API listening on port ${PORT}`);
});

const shutdown = (signal: NodeJS.Signals) => {
  console.log(`${signal} received; closing HTTP server`);
  server.close((error) => {
    if (error) {
      console.error("Failed to close HTTP server", error);
      process.exitCode = 1;
    }
  });
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
