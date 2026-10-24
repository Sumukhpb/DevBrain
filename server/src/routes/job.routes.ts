import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { getRepositoryImportJob } from "../jobs/indexing.queue";

const router = Router();
router.use(requireAuth);

router.get("/:jobId", async (req, res, next) => {
  const jobId = String(req.params.jobId);
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) { res.status(404).json({ error: "Index job not found." }); return; }
  try { res.json({ job: await getRepositoryImportJob(jobId, req.user!.id) }); } catch (error) { next(error); }
});

export default router;
