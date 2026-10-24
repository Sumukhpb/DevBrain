import path from "node:path";
import { config as loadEnv } from "dotenv";

async function start() {
  loadEnv({ path: path.resolve(__dirname, "../.env") });
  const { connectDatabase, closeDatabase } = await import("./db/connection");
  await connectDatabase();
  const { startIndexingWorker } = await import("./jobs/indexing.worker");
  const worker = startIndexingWorker();

  const shutdown = (signal: NodeJS.Signals) => {
    console.log(`${signal} received; closing indexing worker`);
    void worker.close().then(() => closeDatabase()).then(() => { process.exitCode = 0; }).catch((error: unknown) => {
      console.error("Failed to close indexing worker", error);
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

void start().catch((error: unknown) => {
  console.error("Indexing worker failed to start", error);
  process.exitCode = 1;
});
