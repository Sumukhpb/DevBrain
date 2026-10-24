/**
 * Provider boundary for model work. The repository/RAG services depend on
 * these functions rather than on one vendor's request and response shape.
 */
export type ChatMessage = { role: "system" | "user"; content: string };

export function selectedProvider() {
  const provider = (process.env.AI_PROVIDER ?? "ollama").toLowerCase();
  if (provider !== "ollama" && provider !== "openai") {
    throw new Error("AI_PROVIDER must be either ollama or openai.");
  }
  return provider;
}

export function providerReady() {
  return selectedProvider() === "ollama" || Boolean(process.env.OPENAI_API_KEY);
}

export type ProviderHealth = {
  provider: string;
  ready: boolean;
  status: "ready" | "configured" | "unreachable" | "timeout" | "model_missing" | "not_configured" | "misconfigured";
  message: string;
  chatModel?: string;
  baseUrl?: string;
};

export async function checkProviderHealth(): Promise<ProviderHealth> {
  const providerName = (process.env.AI_PROVIDER ?? "ollama").toLowerCase();
  if (providerName !== "ollama" && providerName !== "openai") {
    return { provider: providerName, ready: false, status: "misconfigured", message: "AI_PROVIDER must be either ollama or openai." };
  }
  if (providerName === "openai") {
    return process.env.OPENAI_API_KEY
      ? { provider: "openai", ready: true, status: "configured", message: "OpenAI credentials are configured. The provider is checked when you ask a question." }
      : { provider: "openai", ready: false, status: "not_configured", message: "AI_PROVIDER is openai, but OPENAI_API_KEY is not configured." };
  }

  const baseUrl = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
  const chatModel = process.env.OLLAMA_CHAT_MODEL ?? "qwen2.5-coder:3b";
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3_000) });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return {
      provider: "ollama", ready: false, status: timedOut ? "timeout" : "unreachable", chatModel, baseUrl,
      message: timedOut
        ? "Ollama did not respond within 3 seconds. It may be starting; check again shortly."
        : `Can't reach Ollama at ${baseUrl}. Start the Ollama app and check OLLAMA_BASE_URL.`,
    };
  }
  if (!response.ok) {
    return { provider: "ollama", ready: false, status: "unreachable", chatModel, baseUrl, message: `Ollama responded with HTTP ${response.status}. Check that its local service is running.` };
  }

  let payload: { models?: Array<{ name?: string; model?: string }> };
  try { payload = await response.json() as typeof payload; }
  catch { return { provider: "ollama", ready: false, status: "unreachable", chatModel, baseUrl, message: "Ollama responded with an unreadable model list. Restart the Ollama service and check again." }; }
  const installedModels = (payload.models ?? []).flatMap((model) => [model.name, model.model]).filter((name): name is string => typeof name === "string");
  if (!installedModels.includes(chatModel)) {
    return { provider: "ollama", ready: false, status: "model_missing", chatModel, baseUrl, message: `Ollama is running, but chat model "${chatModel}" is not installed. Run: ollama pull ${chatModel}` };
  }
  return { provider: "ollama", ready: true, status: "ready", chatModel, baseUrl, message: `Ollama is running and chat model "${chatModel}" is installed.` };
}

function ollamaRequestError(error: unknown) {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return new Error("Ollama took too long to respond. The model may be loading; retry the question in a moment.");
  }
  return new Error("Could not reach Ollama. Start the Ollama app/service and check OLLAMA_BASE_URL.");
}

export async function createAnswer(messages: ChatMessage[]) {
  if (selectedProvider() === "ollama") {
    const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
    let response: Response;
    try {
      response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(120_000),
        body: JSON.stringify({
          model: process.env.OLLAMA_CHAT_MODEL ?? "qwen2.5-coder:3b",
          messages,
          stream: false,
          options: { temperature: 0.1, num_predict: 900 },
        }),
      });
    } catch (error) {
      throw ollamaRequestError(error);
    }
    if (!response.ok) {
      throw new Error(response.status === 404
        ? "Ollama could not find the configured chat model. Pull the model or update OLLAMA_CHAT_MODEL."
        : `Local Ollama request failed (${response.status}).`);
    }
    const payload = await response.json() as { message?: { content?: string } };
    const answer = payload.message?.content;
    if (!answer) throw new Error("The local model returned an empty answer.");
    return answer;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("AI_PROVIDER is set to openai but OPENAI_API_KEY is not configured.");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      model: process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini",
      temperature: 0.1,
      max_tokens: 900,
      messages,
    }),
  });
  if (!response.ok) throw new Error(response.status === 429 ? "AI provider rate limit reached. Try again shortly." : `AI provider request failed (${response.status}).`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const answer = payload.choices?.[0]?.message?.content;
  if (!answer) throw new Error("AI provider returned an empty answer.");
  return answer;
}

export function embeddingConfiguration() {
  const provider = selectedProvider();
  return provider === "ollama"
    ? {
        model: process.env.OLLAMA_EMBEDDING_MODEL ?? "embeddinggemma",
        dimensions: Number(process.env.OLLAMA_EMBEDDING_DIMENSIONS ?? 768),
      }
    : {
        model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
        dimensions: Number(process.env.OPENAI_EMBEDDING_DIMENSIONS ?? 1536),
      };
}

export async function createEmbeddings(texts: string[]) {
  const provider = selectedProvider();
  if (provider === "ollama") {
    const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
    const model = process.env.OLLAMA_EMBEDDING_MODEL ?? "embeddinggemma";
    let response: Response;
    try {
      response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(120_000),
        body: JSON.stringify({ model, input: texts, truncate: false }),
      });
    } catch (error) {
      throw ollamaRequestError(error);
    }
    if (!response.ok) {
      throw new Error(response.status === 404
        ? "Ollama could not find the configured embedding model. Pull the model or update OLLAMA_EMBEDDING_MODEL."
        : `Local Ollama embedding request failed (${response.status}).`);
    }
    const payload = await response.json() as { embeddings?: number[][] };
    const vectors = payload.embeddings ?? [];
    const { dimensions } = embeddingConfiguration();
    if (vectors.length !== texts.length || vectors.some((vector) => vector.length !== dimensions)) {
      throw new Error(`Ollama embedding dimensions did not match OLLAMA_EMBEDDING_DIMENSIONS (${dimensions}).`);
    }
    return vectors;
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("AI_PROVIDER is set to openai but OPENAI_API_KEY is not configured.");
  const { model, dimensions } = embeddingConfiguration();
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({ model, input: texts, dimensions }),
  });
  if (!response.ok) throw new Error(response.status === 429 ? "OpenAI rate limit reached during embedding." : `OpenAI embedding request failed (${response.status}).`);
  const payload = await response.json() as { data?: Array<{ index: number; embedding: number[] }> };
  const vectors = [...(payload.data ?? [])].sort((a, b) => a.index - b.index).map(({ embedding }) => embedding);
  if (vectors.length !== texts.length || vectors.some((vector) => vector.length !== dimensions)) throw new Error("OpenAI returned embeddings with an unexpected shape.");
  return vectors;
}
