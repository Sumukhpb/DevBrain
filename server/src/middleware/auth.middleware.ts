import type { NextFunction, Request, Response } from "express";
import { getUserForSession, type AuthUser } from "../services/auth.service";

declare global {
  namespace Express { interface Request { user?: AuthUser } }
}

export const sessionCookie = "devbrain_session";

export function cookieToken(request: Request) {
  const cookie = request.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${sessionCookie}=`));
  return cookie?.slice(sessionCookie.length + 1);
}

export async function requireAuth(request: Request, response: Response, next: NextFunction) {
  try {
    const user = await getUserForSession(cookieToken(request));
    if (!user) { response.status(401).json({ error: "Sign in to continue." }); return; }
    request.user = user;
    next();
  } catch (error) { next(error); }
}

export function requireRequestIntent(request: Request, response: Response, next: NextFunction) {
  if (request.get("X-DevBrain-Request") !== "1") { response.status(403).json({ error: "Request origin check failed." }); return; }
  next();
}

export function setSessionCookie(response: Response, token: string, expiresAt: number) {
  const attributes = [
    `${sessionCookie}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ];
  if (process.env.NODE_ENV === "production") attributes.push("Secure");
  response.setHeader("Set-Cookie", attributes.join("; "));
}

export function clearSessionCookie(response: Response) {
  response.setHeader("Set-Cookie", `${sessionCookie}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
}
