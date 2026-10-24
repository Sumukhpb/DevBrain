import mongoose from "mongoose";
import { ConversationModel, MessageModel, MigrationModel, RepositoryModel, SessionModel, UserModel } from "./models";

export async function connectDatabase() {
  const uri = process.env.MONGODB_URI?.trim() || "mongodb://127.0.0.1:27018/devbrain";
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5_000, maxPoolSize: 10 });
  await Promise.all([UserModel, SessionModel, RepositoryModel, ConversationModel, MessageModel, MigrationModel].map((model) => model.init()));
  console.log("Connected to MongoDB");
}

export async function closeDatabase() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}

export function databaseReady() {
  return mongoose.connection.readyState === 1;
}
