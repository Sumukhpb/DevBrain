import { readFile } from "node:fs/promises";
import path from "node:path";
import { ConversationModel, MessageModel, MigrationModel, RepositoryModel, SessionModel, UserModel } from "./models";

const dataDirectory = path.resolve(process.env.DATA_DIR ?? "data");
const migrationName = "json-stores-to-mongodb-v1";

async function readJson<T>(name: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(path.join(dataDirectory, name), "utf8")) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback; throw error; }
}

export async function migrateJsonStores() {
  if (await MigrationModel.exists({ name: migrationName })) return;
  const [auth, repositories, conversations] = await Promise.all([
    readJson<{ accounts: Array<Record<string, unknown>>; sessions: Array<Record<string, unknown>> }>("accounts.json", { accounts: [], sessions: [] }),
    readJson<Array<Record<string, unknown>>>("repositories.json", []),
    readJson<Array<Record<string, unknown>>>("conversations.json", []),
  ]);

  for (const account of auth.accounts) await UserModel.updateOne({ id: account.id }, { $setOnInsert: account }, { upsert: true });
  for (const session of auth.sessions) {
    const expiresAt = typeof session.expiresAt === "number" ? new Date(session.expiresAt) : session.expiresAt;
    if (new Date(expiresAt as string | number | Date) > new Date()) {
      await SessionModel.updateOne({ tokenHash: session.tokenHash }, { $setOnInsert: { ...session, expiresAt } }, { upsert: true });
    }
  }
  for (const { messages = [], ...conversation } of conversations) {
    await ConversationModel.updateOne({ id: conversation.id }, { $setOnInsert: conversation }, { upsert: true });
    for (const message of messages as Array<Record<string, unknown>>) {
      await MessageModel.updateOne({ id: message.id }, { $setOnInsert: { ...message, conversationId: conversation.id } }, { upsert: true });
    }
  }
  for (const repository of repositories) await RepositoryModel.updateOne({ id: repository.id }, { $setOnInsert: repository }, { upsert: true });
  await MigrationModel.create({ name: migrationName, completedAt: new Date() });
  console.log("Imported existing JSON data into MongoDB; original files were preserved");
}
