import { createHash } from "node:crypto";
import { createEmbeddings, embeddingConfiguration, selectedProvider } from "./provider";

function activeCollectionName() {
  // Keep vectors from different embedding models in separate collections;
  // Qdrant collections require every vector to have the same dimension.
  return process.env.QDRANT_COLLECTION?.trim() || (selectedProvider() === "ollama" ? "devbrain_code_chunks_ollama" : "devbrain_code_chunks");
}

export function vectorSearchConfigured() {
  return Boolean(process.env.QDRANT_URL && (selectedProvider() === "ollama" || process.env.OPENAI_API_KEY));
}

function qdrantHeaders() {
  return { "Content-Type": "application/json", ...(process.env.QDRANT_API_KEY ? { "api-key": process.env.QDRANT_API_KEY } : {}) };
}

function qdrantEndpoint(path: string) {
  const base = process.env.QDRANT_URL;
  if (!base) throw new Error("QDRANT_URL is not configured.");
  let url: URL;
  try { url = new URL(base); } catch { throw new Error("QDRANT_URL must be a valid HTTP(S) URL."); }
  if (!(["http:", "https:"].includes(url.protocol)) || url.username || url.password || url.search || url.hash) throw new Error("QDRANT_URL must be a valid HTTP(S) service URL without credentials or query parameters.");
  return `${url.toString().replace(/\/$/, "")}${path}`;
}

async function ensureCollection() {
  const { dimensions } = embeddingConfiguration();
  const provider = selectedProvider();
  if (!Number.isInteger(dimensions) || dimensions < 1 || dimensions > 3072) throw new Error(`${provider === "ollama" ? "OLLAMA" : "OPENAI"}_EMBEDDING_DIMENSIONS must be an integer between 1 and 3,072.`);
  const collectionName = activeCollectionName();
  const url = qdrantEndpoint(`/collections/${encodeURIComponent(collectionName)}`);
  const exists = await fetch(url, { headers: qdrantHeaders(), signal: AbortSignal.timeout(12_000) });
  if (exists.ok) return;
  if (exists.status !== 404) throw new Error(`Qdrant collection check failed (${exists.status}).`);
  const created = await fetch(url, {
    method: "PUT", headers: qdrantHeaders(), signal: AbortSignal.timeout(12_000),
    body: JSON.stringify({ vectors: { size: dimensions, distance: "Cosine" } }),
  });
  if (!created.ok && created.status !== 409) throw new Error(`Qdrant collection creation failed (${created.status}).`);
}

export type VectorChunk = { filePath: string; language: string; startLine: number; endLine: number; text: string };

function deterministicPointId(userId: string, repositoryId: string, commitSha: string, chunk: VectorChunk) {
  const bytes = createHash("sha256").update([userId, repositoryId, commitSha, chunk.filePath, chunk.startLine, chunk.endLine].join("\0")).digest("hex").slice(0, 32).split("");
  bytes[12] = "5";
  bytes[16] = ((Number.parseInt(bytes[16], 16) & 0x3) | 0x8).toString(16);
  const value = bytes.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

async function deleteRepositoryVectors(userId: string, repositoryId: string) {
  const collectionName = activeCollectionName();
  const response = await fetch(qdrantEndpoint(`/collections/${encodeURIComponent(collectionName)}/points/delete?wait=true`), {
    method: "POST", headers: qdrantHeaders(), signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({ filter: { must: [{ key: "user_id", match: { value: userId } }, { key: "repository_id", match: { value: repositoryId } }] } }),
  });
  if (!response.ok) throw new Error(`Qdrant repository-vector cleanup failed (${response.status}).`);
}

export async function indexCodeChunks(userId: string, repositoryId: string, commitSha: string, chunks: VectorChunk[], onProgress?: (progress: number) => Promise<unknown> | unknown) {
  if (!vectorSearchConfigured()) return false;
  await ensureCollection();
  const collectionName = activeCollectionName();
  await deleteRepositoryVectors(userId, repositoryId);
  const batchSize = 32;
  try {
    for (let offset = 0; offset < chunks.length; offset += batchSize) {
      const batch = chunks.slice(offset, offset + batchSize);
      const vectors = await createEmbeddings(batch.map(({ text }) => text));
      const points = batch.map((chunk, index) => ({
        id: deterministicPointId(userId, repositoryId, commitSha, chunk), vector: vectors[index],
        payload: { user_id: userId, repository_id: repositoryId, commit_sha: commitSha, file_path: chunk.filePath, language: chunk.language, start_line: chunk.startLine, end_line: chunk.endLine, text: chunk.text },
      }));
      const response = await fetch(qdrantEndpoint(`/collections/${encodeURIComponent(collectionName)}/points?wait=true`), {
        method: "PUT", headers: qdrantHeaders(), signal: AbortSignal.timeout(45_000), body: JSON.stringify({ points }),
      });
      if (!response.ok) throw new Error(`Qdrant vector upsert failed (${response.status}).`);
      await onProgress?.((offset + batch.length) / Math.max(1, chunks.length));
    }
  } catch (error) {
    try { await deleteRepositoryVectors(userId, repositoryId); } catch { /* Best-effort cleanup; the next idempotent run retries it. */ }
    throw error;
  }
  return true;
}

export async function searchCodeChunks(userId: string, repositoryId: string, commitSha: string, query: string) {
  await ensureCollection();
  const collectionName = activeCollectionName();
  const [vector] = await createEmbeddings([query]);
  const response = await fetch(qdrantEndpoint(`/collections/${encodeURIComponent(collectionName)}/points/query`), {
    method: "POST", headers: qdrantHeaders(), signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({ query: vector, limit: 8, with_payload: true, filter: { must: [
      { key: "user_id", match: { value: userId } },
      { key: "repository_id", match: { value: repositoryId } },
      { key: "commit_sha", match: { value: commitSha } },
    ] } }),
  });
  if (!response.ok) throw new Error(`Qdrant vector search failed (${response.status}).`);
  const payload = await response.json() as { result?: { points?: Array<{ score: number; payload?: Record<string, unknown> }> } };
  return (payload.result?.points ?? []).flatMap((point) => {
    const data = point.payload;
    if (!data || typeof data.file_path !== "string" || typeof data.text !== "string" || typeof data.language !== "string" || typeof data.start_line !== "number" || typeof data.end_line !== "number") return [];
    return [{ filePath: data.file_path, language: data.language, startLine: data.start_line, endLine: data.end_line, text: data.text, score: point.score }];
  });
}
