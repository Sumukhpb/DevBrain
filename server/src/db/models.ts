import mongoose, { Schema } from "mongoose";

const userSchema = new Schema({
  id: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  salt: { type: String, required: true },
  passwordHash: { type: String, required: true },
  createdAt: { type: String, required: true },
}, { versionKey: false });

const sessionSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true, expires: 0 },
}, { versionKey: false });

const indexedFileSchema = new Schema({
  path: { type: String, required: true },
  language: { type: String, required: true },
  content: { type: String, required: true },
}, { _id: false });

const repositorySchema = new Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  owner: { type: String, required: true },
  name: { type: String, required: true },
  fullName: { type: String, required: true },
  description: { type: String, default: null },
  branch: { type: String, required: true },
  commitSha: { type: String, required: true },
  url: { type: String, required: true },
  indexedAt: { type: String, required: true },
  vectorIndexed: { type: Boolean, default: false },
  files: { type: [indexedFileSchema], default: [] },
}, { versionKey: false });
repositorySchema.index({ userId: 1, fullName: 1, branch: 1 }, { unique: true });

const conversationSchema = new Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  repositoryId: { type: String, required: true },
  title: { type: String, required: true },
  createdAt: { type: String, required: true },
  updatedAt: { type: String, required: true },
}, { versionKey: false });
conversationSchema.index({ userId: 1, repositoryId: 1, updatedAt: -1 });

const citationSchema = new Schema({
  filePath: { type: String, required: true },
  startLine: { type: Number, required: true },
  endLine: { type: Number, required: true },
  url: { type: String, required: true },
}, { _id: false });
const messageSchema = new Schema({
  id: { type: String, required: true, unique: true },
  conversationId: { type: String, required: true },
  role: { type: String, enum: ["user", "assistant"], required: true },
  content: { type: String, required: true },
  citations: { type: [citationSchema], default: [] },
  createdAt: { type: String, required: true },
}, { versionKey: false });
messageSchema.index({ conversationId: 1, createdAt: 1 });

const migrationSchema = new Schema({
  name: { type: String, required: true, unique: true },
  completedAt: { type: Date, required: true },
}, { versionKey: false });

export const UserModel = mongoose.models.User ?? mongoose.model("User", userSchema);
export const SessionModel = mongoose.models.Session ?? mongoose.model("Session", sessionSchema);
export const RepositoryModel = mongoose.models.Repository ?? mongoose.model("Repository", repositorySchema);
export const ConversationModel = mongoose.models.Conversation ?? mongoose.model("Conversation", conversationSchema);
export const MessageModel = mongoose.models.Message ?? mongoose.model("Message", messageSchema);
export const MigrationModel = mongoose.models.Migration ?? mongoose.model("Migration", migrationSchema);
