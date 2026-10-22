import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const scrypt = promisify(scryptCallback);
const authFile = path.resolve(process.env.DATA_DIR ?? "data", "accounts.json");
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;
type Account = { id: string; email: string; salt: string; passwordHash: string; createdAt: string };
type Session = { tokenHash: string; userId: string; expiresAt: number };
type AuthStore = { accounts: Account[]; sessions: Session[] };
export type AuthUser = { id: string; email: string };

async function readStore(): Promise<AuthStore> {
  try { return JSON.parse(await readFile(authFile, "utf8")) as AuthStore; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { accounts: [], sessions: [] }; throw error; }
}

async function writeStore(store: AuthStore) {
  await mkdir(path.dirname(authFile), { recursive: true });
  const temporaryPath = `${authFile}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(store, null, 2), "utf8");
  await rename(temporaryPath, authFile);
}

function sessionDigest(token: string) { return createHash("sha256").update(token).digest("hex"); }
function safeUser(account: Account): AuthUser { return { id: account.id, email: account.email }; }

async function createSession(store: AuthStore, account: Account) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + sessionLifetimeMs;
  store.sessions = store.sessions.filter((session) => session.expiresAt > Date.now());
  store.sessions.push({ tokenHash: sessionDigest(token), userId: account.id, expiresAt });
  await writeStore(store);
  return { token, user: safeUser(account), expiresAt };
}

export async function register(emailInput: unknown, passwordInput: unknown) {
  if (typeof emailInput !== "string" || typeof passwordInput !== "string") throw new Error("Enter an email address and password.");
  const email = emailInput.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  if (passwordInput.length < 12 || passwordInput.length > 128) throw new Error("Password must be between 12 and 128 characters.");
  const store = await readStore();
  if (store.accounts.some((account) => account.email === email)) throw new Error("An account with that email already exists.");
  const salt = randomBytes(16).toString("hex");
  const passwordHash = (await scrypt(passwordInput, salt, 64)) as Buffer;
  const account: Account = { id: randomBytes(16).toString("hex"), email, salt, passwordHash: passwordHash.toString("hex"), createdAt: new Date().toISOString() };
  store.accounts.push(account);
  return createSession(store, account);
}

export async function login(emailInput: unknown, passwordInput: unknown) {
  if (typeof emailInput !== "string" || typeof passwordInput !== "string") throw new Error("Email or password is incorrect.");
  const store = await readStore();
  const account = store.accounts.find((entry) => entry.email === emailInput.trim().toLowerCase());
  const salt = account?.salt ?? "00".repeat(16);
  const actual = (await scrypt(passwordInput.slice(0, 128), salt, 64)) as Buffer;
  const expected = Buffer.from(account?.passwordHash ?? "00".repeat(64), "hex");
  if (!account || expected.length !== actual.length || !timingSafeEqual(actual, expected)) throw new Error("Email or password is incorrect.");
  return createSession(store, account);
}

export async function getUserForSession(token: string | undefined) {
  if (!token || !/^[a-f\d]{64}$/i.test(token)) return null;
  const store = await readStore();
  const digest = sessionDigest(token);
  const session = store.sessions.find((entry) => entry.tokenHash === digest && entry.expiresAt > Date.now());
  const account = session && store.accounts.find((entry) => entry.id === session.userId);
  return account ? safeUser(account) : null;
}

export async function deleteSession(token: string | undefined) {
  if (!token) return;
  const store = await readStore();
  const digest = sessionDigest(token);
  store.sessions = store.sessions.filter((session) => session.tokenHash !== digest && session.expiresAt > Date.now());
  await writeStore(store);
}
