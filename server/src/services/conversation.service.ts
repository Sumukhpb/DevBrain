import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { answerQuestion, getRepository } from "./repository.service";

export type ConversationMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: { filePath: string; startLine: number; endLine: number; url: string }[];
  createdAt: string;
};
export type ConversationRecord = {
  id: string;
  userId: string;
  repositoryId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ConversationMessage[];
};

const storePath = path.resolve(process.env.DATA_DIR ?? "data", "conversations.json");

async function readStore(): Promise<ConversationRecord[]> {
  try { return JSON.parse(await readFile(storePath, "utf8")) as ConversationRecord[]; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}

async function writeStore(records: ConversationRecord[]) {
  await mkdir(path.dirname(storePath), { recursive: true });
  const temporaryPath = `${storePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(records, null, 2), "utf8");
  await rename(temporaryPath, storePath);
}

export async function listConversations(repositoryId: string, userId: string) {
  await getRepository(repositoryId, userId);
  return (await readStore()).filter((conversation) => conversation.userId === userId && conversation.repositoryId === repositoryId)
    .map(({ messages, userId: _userId, ...conversation }) => ({ ...conversation, messageCount: messages.length }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getConversation(id: string, userId: string) {
  const conversation = (await readStore()).find((record) => record.id === id && record.userId === userId);
  if (!conversation) throw new Error("Conversation not found.");
  await getRepository(conversation.repositoryId, userId);
  const { userId: _userId, ...publicConversation } = conversation;
  return publicConversation;
}

export async function createConversation(repositoryId: string, userId: string, title: string) {
  await getRepository(repositoryId, userId);
  const now = new Date().toISOString();
  const conversation: ConversationRecord = { id: randomUUID(), userId, repositoryId, title: title.trim().slice(0, 120) || "Repository questions", createdAt: now, updatedAt: now, messages: [] };
  const records = await readStore();
  records.unshift(conversation);
  await writeStore(records);
  const { userId: _userId, ...publicConversation } = conversation;
  return publicConversation;
}

export async function askInConversation(id: string, userId: string, question: string) {
  const records = await readStore();
  const conversation = records.find((record) => record.id === id && record.userId === userId);
  if (!conversation) throw new Error("Conversation not found.");
  await getRepository(conversation.repositoryId, userId);
  const result = await answerQuestion(conversation.repositoryId, question, userId);
  const timestamp = new Date().toISOString();
  conversation.messages.push(
    { id: randomUUID(), role: "user", content: question, citations: [], createdAt: timestamp },
    { id: randomUUID(), role: "assistant", content: result.answer, citations: result.citations, createdAt: new Date().toISOString() },
  );
  conversation.updatedAt = new Date().toISOString();
  await writeStore(records);
  return result;
}
