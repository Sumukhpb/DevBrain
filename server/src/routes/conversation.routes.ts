import { Router } from "express";
import { requireAuth, requireRequestIntent } from "../middleware/auth.middleware";
import { rateLimit } from "../middleware/rate-limit.middleware";
import { askInConversation, createConversation, getConversation, listConversations } from "../services/conversation.service";

const router = Router();
const writeLimit = rateLimit(12, 60_000);
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  const repositoryId = req.query.repositoryId;
  if (typeof repositoryId !== "string") { res.status(400).json({ error: "Provide a repositoryId." }); return; }
  try { res.json({ conversations: await listConversations(repositoryId, req.user!.id) }); } catch (error) { next(error); }
});

router.post("/", writeLimit, requireRequestIntent, async (req, res, next) => {
  const { repositoryId, title } = req.body ?? {};
  if (typeof repositoryId !== "string" || repositoryId.length > 100 || (title !== undefined && (typeof title !== "string" || title.length > 120))) {
    res.status(400).json({ error: "Provide a repositoryId and an optional title of at most 120 characters." }); return;
  }
  try { res.status(201).json({ conversation: await createConversation(repositoryId, req.user!.id, title ?? "") }); } catch (error) { next(error); }
});

router.get("/:id", async (req, res, next) => {
  try { res.json({ conversation: await getConversation(String(req.params.id), req.user!.id) }); } catch (error) { next(error); }
});

router.post("/:id/messages", writeLimit, requireRequestIntent, async (req, res, next) => {
  const { question } = req.body ?? {};
  if (typeof question !== "string" || question.trim().length < 3 || question.length > 2_000) {
    res.status(400).json({ error: "Question must contain between 3 and 2,000 characters." }); return;
  }
  try { res.json(await askInConversation(String(req.params.id), req.user!.id, question.trim())); } catch (error) { next(error); }
});

export default router;
