import { Router } from "express";
import { requireAuth, requireRequestIntent } from "../middleware/auth.middleware";
import { cancelRepositoryImport, getRepositoryImportJob } from "../jobs/indexing.queue";

const router = Router();
router.use(requireAuth);

router.get("/:jobId", async (req, res, next) => {
  const jobId = String(req.params.jobId);
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) { res.status(404).json({ error: "Index job not found." }); return; }
  try { res.json({ job: await getRepositoryImportJob(jobId, req.user!.id) }); } catch (error) { next(error); }
});

router.delete("/:jobId", requireRequestIntent, async (req, res, next) => {
  const jobId = String(req.params.jobId);
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) { res.status(404).json({ error: "Index job not found." }); return; }
  try {
    const job = await cancelRepositoryImport(jobId, req.user!.id);
    res.json({ job });
  } catch (error) {
    if (error instanceof Error && /already|started before it could be cancelled/i.test(error.message)) {
      res.status(409).json({ error: error.message });
      return;
    }
    next(error);
  }
});

export default router;
