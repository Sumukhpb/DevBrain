import { UnrecoverableError, Worker } from "bullmq";
import { importRepository } from "../services/repository.service";
import { INDEXING_QUEUE_NAME } from "./indexing.constants";
import type { ImportedRepository, RepositoryImportJob } from "./indexing.queue";

export function startIndexingWorker() {
  const concurrency = Number(process.env.INDEX_WORKER_CONCURRENCY ?? 1);
  if (concurrency !== 1) {
    throw new Error("INDEX_WORKER_CONCURRENCY must be 1 while repository imports are configured to run serially.");
  }

  const worker = new Worker<RepositoryImportJob, ImportedRepository>(INDEXING_QUEUE_NAME, async (job) => {
    console.log("Starting repository import", { jobId: job.id, userId: job.data.userId });
    try {
      return await importRepository(job.data.url, job.data.userId, job.data.branch, (progress) => job.updateProgress(progress));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Repository import failed.";
      const permanent = /(only public|not found|too large|truncated|invalid|too long|ollama could not find|not configured)/i.test(message)
        && !/rate limit/i.test(message);
      if (permanent) throw new UnrecoverableError(message);
      throw error;
    }
  }, { connection: { url: process.env.REDIS_URL ?? "redis://127.0.0.1:6379", maxRetriesPerRequest: null, connectTimeout: 5_000 }, concurrency });

  worker.on("completed", (job) => console.log("Repository import completed", { jobId: job.id }));
  worker.on("failed", (job, error) => console.error("Repository import failed", { jobId: job?.id, error: error.message }));
  worker.on("error", (error) => console.error("Index worker error", { error: error.message }));

  return {
    close: async () => {
      await worker.close();
    },
  };
}
