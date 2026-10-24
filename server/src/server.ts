import path from "node:path";
import { config as loadEnv } from "dotenv";

async function start() {
  // Load server/.env before app modules are imported, because those modules
  // read provider and database settings during initialization.
  loadEnv({ path: path.resolve(__dirname, "../.env") });
  const { connectDatabase, closeDatabase } = await import("./db/connection");
  const { migrateJsonStores } = await import("./db/migrate-json");
  await connectDatabase();
  await migrateJsonStores();
  const { default: app } = await import("./app");
  const { closeIndexQueue } = await import("./jobs/indexing.queue");

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
      void closeIndexQueue().catch((closeError: unknown) => {
        console.error("Failed to close indexing queue", closeError);
        process.exitCode = 1;
      }).finally(() => closeDatabase().catch((closeError: unknown) => {
        console.error("Failed to close MongoDB connection", closeError);
        process.exitCode = 1;
      }));
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

void start().catch((error: unknown) => {
  console.error("DevBrain API failed to start", error);
  process.exitCode = 1;
});
