import { Router } from "express";
import { requireAuth, requireRequestIntent } from "../middleware/auth.middleware";
import { rateLimit } from "../middleware/rate-limit.middleware";
import { getRepository, getRepositoryFile, listRepositories, parseGitHubUrl } from "../services/repository.service";
import { enqueueRepositoryImport } from "../jobs/indexing.queue";

const router = Router();
const mutationRateLimit = rateLimit(12, 60_000);
router.use(requireAuth);

router.get("/", async (_req, res, next) => {
  try { res.json({ repositories: await listRepositories(_req.user!.id) }); } catch (error) { next(error); }
});

router.post("/", mutationRateLimit, requireRequestIntent, async (req, res, next) => {
  const { url, branch } = req.body ?? {};
  if (typeof url !== "string" || url.length > 500 || (branch !== undefined && (typeof branch !== "string" || branch.length > 200))) {
    res.status(400).json({ error: "Provide a GitHub repository URL and an optional branch." });
    return;
  }
  try {
    parseGitHubUrl(url);
    const jobId = await enqueueRepositoryImport({ url, userId: req.user!.id, branch });
    res.status(202).json({ jobId, status: "queued" });
  } catch (error) { next(error); }
});

router.get("/:id", async (req, res, next) => {
  try { res.json({ repository: await getRepository(String(req.params.id), req.user!.id) }); } catch (error) { next(error); }
});

router.get("/:id/files", async (req, res, next) => {
  const filePath = req.query.path;
  if (typeof filePath !== "string" || filePath.length > 500) {
    res.status(400).json({ error: "Provide a valid file path in the path query parameter." });
    return;
  }
  try { res.json({ file: await getRepositoryFile(String(req.params.id), filePath, req.user!.id) }); } catch (error) { next(error); }
});

export default router;
