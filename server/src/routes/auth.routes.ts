import { Router } from "express";
import { clearSessionCookie, cookieToken, requireAuth, requireRequestIntent, setSessionCookie } from "../middleware/auth.middleware";
import { rateLimit } from "../middleware/rate-limit.middleware";
import { deleteSession, login, register } from "../services/auth.service";

const router = Router();
const authRateLimit = rateLimit(12, 60_000);

router.get("/me", requireAuth, (req, res) => res.json({ user: req.user }));

router.post("/register", authRateLimit, requireRequestIntent, async (req, res) => {
  try {
    const session = await register(req.body?.email, req.body?.password);
    setSessionCookie(res, session.token, session.expiresAt);
    res.status(201).json({ user: session.user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create account.";
    res.status(message.startsWith("An account") ? 409 : 400).json({ error: message });
  }
});

router.post("/login", authRateLimit, requireRequestIntent, async (req, res) => {
  try {
    const session = await login(req.body?.email, req.body?.password);
    setSessionCookie(res, session.token, session.expiresAt);
    res.json({ user: session.user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email or password is incorrect.";
    res.status(message.startsWith("Email or password") ? 401 : 400).json({ error: message });
  }
});

router.post("/logout", requireRequestIntent, async (req, res, next) => {
  try { await deleteSession(cookieToken(req)); clearSessionCookie(res); res.status(204).end(); }
  catch (error) { next(error); }
});

export default router;
