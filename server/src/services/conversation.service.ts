import { randomUUID } from "node:crypto";
import { answerQuestion, getRepository } from "./repository.service";
import { ConversationModel, MessageModel } from "../db/models";

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

export async function listConversations(repositoryId: string, userId: string) {
  await getRepository(repositoryId, userId);
  const conversations = await ConversationModel.find({ userId, repositoryId }).sort({ updatedAt: -1 }).lean<Array<Omit<ConversationRecord, "messages">>>();
  return Promise.all(conversations.map(async ({ userId: _userId, ...conversation }) => ({
    ...conversation,
    messageCount: await MessageModel.countDocuments({ conversationId: conversation.id }),
  })));
}

export async function getConversation(id: string, userId: string) {
  const conversation = await ConversationModel.findOne({ id, userId }).lean<Omit<ConversationRecord, "messages"> | null>();
  if (!conversation) throw new Error("Conversation not found.");
  await getRepository(conversation.repositoryId, userId);
  const messages = await MessageModel.find({ conversationId: id }).sort({ createdAt: 1 }).lean<ConversationMessage[]>();
  const { userId: _userId, ...publicConversation } = conversation;
  return { ...publicConversation, messages };
}

export async function createConversation(repositoryId: string, userId: string, title: string) {
  await getRepository(repositoryId, userId);
  const now = new Date().toISOString();
  const conversation = { id: randomUUID(), userId, repositoryId, title: title.trim().slice(0, 120) || "Repository questions", createdAt: now, updatedAt: now };
  await ConversationModel.create(conversation);
  const { userId: _userId, ...publicConversation } = conversation;
  return { ...publicConversation, messages: [] };
}

export async function askInConversation(id: string, userId: string, question: string) {
  const conversation = await ConversationModel.findOne({ id, userId }).lean<Omit<ConversationRecord, "messages"> | null>();
  if (!conversation) throw new Error("Conversation not found.");
  await getRepository(conversation.repositoryId, userId);
  const result = await answerQuestion(conversation.repositoryId, question, userId);
  const timestamp = new Date().toISOString();
  await MessageModel.create([
    { id: randomUUID(), conversationId: id, role: "user", content: question, citations: [], createdAt: timestamp },
    { id: randomUUID(), conversationId: id, role: "assistant", content: result.answer, citations: result.citations, createdAt: new Date().toISOString() },
  ]);
  await ConversationModel.updateOne({ id, userId }, { $set: { updatedAt: new Date().toISOString() } });
  return result;
}
