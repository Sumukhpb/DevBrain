import { randomUUID } from "node:crypto";
import { Queue } from "bullmq";
import { INDEXING_QUEUE_NAME } from "./indexing.constants";

export type RepositoryImportJob = { url: string; branch?: string; userId: string };
export type ImportedRepository = {
  id: string; fullName: string; description: string | null; branch: string; commitSha: string;
  url: string; indexedAt: string; fileCount: number; vectorIndexed?: boolean;
};

const queue = new Queue<RepositoryImportJob, ImportedRepository>(INDEXING_QUEUE_NAME, {
  connection: { url: process.env.REDIS_URL ?? "redis://127.0.0.1:6379", maxRetriesPerRequest: 1, connectTimeout: 5_000 },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2_000 },
    removeOnComplete: { age: 86_400, count: 500 },
    removeOnFail: { age: 604_800, count: 1_000 },
  },
});

export async function enqueueRepositoryImport(data: RepositoryImportJob) {
  const id = randomUUID();
  try {
    await queue.add("import", data, { jobId: id });
  } catch {
    throw new Error("Redis is unavailable. Start it with `docker compose up -d redis`, then retry the import.");
  }
  return id;
}

export async function getRepositoryImportJob(id: string, userId: string) {
  let job;
  try { job = await queue.getJob(id); }
  catch { throw new Error("Redis is unavailable. Start it with `docker compose up -d redis` and retry."); }
  if (!job || job.data.userId !== userId) throw new Error("Index job not found.");
  const state = await job.getState();
  return {
    id,
    state,
    progress: job.progress,
    repository: state === "completed" ? job.returnvalue : undefined,
    error: state === "failed" ? job.failedReason : undefined,
  };
}

export async function closeIndexQueue() {
  await queue.close();
}

