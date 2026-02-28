import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { executeDistribution } from '../services/contracts.js';
import { scheduleDistribution, cancelSchedule, listScheduledJobs } from '../services/scheduler.js';
import { getDb } from '../db/index.js';

const router = Router();

// POST /api/distribute/execute — Execute batch distribution onchain
router.post('/execute', async (req: Request, res: Response) => {
  try {
    const { token, recipients, amounts } = req.body;

    if (!token || !recipients?.length || !amounts?.length) {
      return res.status(400).json({ success: false, error: 'Missing token, recipients, or amounts' });
    }

    if (recipients.length !== amounts.length) {
      return res.status(400).json({ success: false, error: 'Recipients and amounts length mismatch' });
    }

    const result = await executeDistribution(token, recipients, amounts);

    const db = getDb();
    db.prepare(`
      INSERT INTO transactions (id, type, tx_hash, status, data_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), 'distribution', result.txHash, 'confirmed', JSON.stringify({
      token, recipients, amounts, totalAmount: result.totalAmount,
    }));

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Distribution error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/distribute/schedule — Create a scheduled distribution
router.post('/schedule', async (req: Request, res: Response) => {
  try {
    const { nodeId, schedule, executionDay, token, recipients, amounts } = req.body;

    if (!nodeId || !schedule || !token || !recipients?.length) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const jobId = scheduleDistribution(nodeId, schedule, executionDay, {
      token,
      recipients,
      amounts,
    });

    res.json({
      success: true,
      data: { jobId, schedule, executionDay },
    });
  } catch (error: any) {
    console.error('Schedule distribution error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/distribute/scheduled — List active scheduled distributions
router.get('/scheduled', async (req: Request, res: Response) => {
  try {
    const nodeId = req.query.nodeId as string | undefined;
    const jobs = listScheduledJobs(nodeId);
    res.json({ success: true, data: jobs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/distribute/scheduled/:id — Cancel a scheduled distribution
router.delete('/scheduled/:id', async (req: Request, res: Response) => {
  try {
    const cancelled = cancelSchedule(req.params.id as string);
    res.json({ success: true, data: { cancelled } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
