import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { SessionModel, UserModel } from "../db/models";

const scrypt = promisify(scryptCallback);
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;
type Account = { id: string; email: string; salt: string; passwordHash: string; createdAt: string };
export type AuthUser = { id: string; email: string };

function sessionDigest(token: string) { return createHash("sha256").update(token).digest("hex"); }
function safeUser(account: Pick<Account, "id" | "email">): AuthUser { return { id: account.id, email: account.email }; }

async function createSession(account: Account) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + sessionLifetimeMs);
  await SessionModel.create({ tokenHash: sessionDigest(token), userId: account.id, expiresAt });
  return { token, user: safeUser(account), expiresAt: expiresAt.getTime() };
}

export async function register(emailInput: unknown, passwordInput: unknown) {
  if (typeof emailInput !== "string" || typeof passwordInput !== "string") throw new Error("Enter an email address and password.");
  const email = emailInput.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  if (passwordInput.length < 6 || passwordInput.length > 128) throw new Error("Password must be between 6 and 128 characters.");
  const salt = randomBytes(16).toString("hex");
  const passwordHash = (await scrypt(passwordInput, salt, 64)) as Buffer;
  const account: Account = { id: randomBytes(16).toString("hex"), email, salt, passwordHash: passwordHash.toString("hex"), createdAt: new Date().toISOString() };
  try { await UserModel.create(account); }
  catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) throw new Error("An account with that email already exists.");
    throw error;
  }
  return createSession(account);
}

export async function login(emailInput: unknown, passwordInput: unknown) {
  if (typeof emailInput !== "string" || typeof passwordInput !== "string") throw new Error("Email or password is incorrect.");
  const account = await UserModel.findOne({ email: emailInput.trim().toLowerCase() }).lean<Account | null>();
  const salt = account?.salt ?? "00".repeat(16);
  const actual = (await scrypt(passwordInput.slice(0, 128), salt, 64)) as Buffer;
  const expected = Buffer.from(account?.passwordHash ?? "00".repeat(64), "hex");
  if (!account || expected.length !== actual.length || !timingSafeEqual(actual, expected)) throw new Error("Email or password is incorrect.");
  return createSession(account);
}

export async function getUserForSession(token: string | undefined) {
  if (!token || !/^[a-f\d]{64}$/i.test(token)) return null;
  const session = await SessionModel.findOne({ tokenHash: sessionDigest(token), expiresAt: { $gt: new Date() } }).lean<{ userId: string } | null>();
  if (!session) return null;
  const account = await UserModel.findOne({ id: session.userId }).select({ id: 1, email: 1, _id: 0 }).lean<AuthUser | null>();
  return account ? safeUser(account) : null;
}

export async function deleteSession(token: string | undefined) {
  if (!token) return;
  await SessionModel.deleteOne({ tokenHash: sessionDigest(token) });
}
