import type { NextFunction, Request, Response } from "express";

export function rateLimit(maximum: number, windowMs: number) {
  const clients = new Map<string, { count: number; resetAt: number }>();
  return (request: Request, response: Response, next: NextFunction) => {
    const key = request.ip ?? "unknown";
    const now = Date.now();
    let bucket = clients.get(key);
    if (!bucket || bucket.resetAt <= now) bucket = { count: 0, resetAt: now + windowMs };
    bucket.count += 1;
    clients.set(key, bucket);
    if (clients.size > 10_000) for (const [client, entry] of clients) if (entry.resetAt <= now) clients.delete(client);
    response.setHeader("RateLimit-Limit", String(maximum));
    response.setHeader("RateLimit-Remaining", String(Math.max(0, maximum - bucket.count)));
    if (bucket.count > maximum) { response.status(429).json({ error: "Too many requests. Please try again later." }); return; }
    next();
  };
}
