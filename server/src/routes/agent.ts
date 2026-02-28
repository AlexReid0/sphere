import { Router, Request, Response } from 'express';
import { startAgentSession, stopAgentSession, getAgentStatus, getAgentLogs } from '../services/openclaw.js';

const router = Router();

// POST /api/agent/start — Start an OpenClaw agent session
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { nodeId, instructions, budget, token } = req.body;

    if (!nodeId || !instructions || !budget) {
      return res.status(400).json({ success: false, error: 'Missing nodeId, instructions, or budget' });
    }

    const session = await startAgentSession(nodeId, instructions, budget, token || 'USDC');

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        status: session.status,
        budget: session.budget,
      },
    });
  } catch (error: any) {
    console.error('Agent start error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/agent/:id/stop — Stop an agent session
router.post('/:id/stop', async (req: Request, res: Response) => {
  try {
    await stopAgentSession(req.params.id as string);
    res.json({ success: true, data: { stopped: true } });
  } catch (error: any) {
    console.error('Agent stop error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/agent/:id/status — Get agent status
router.get('/:id/status', async (req: Request, res: Response) => {
  try {
    const status = await getAgentStatus(req.params.id as string);
    if (!status) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    res.json({ success: true, data: status });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/agent/:id/logs — Get agent execution logs
router.get('/:id/logs', async (req: Request, res: Response) => {
  try {
    const logs = await getAgentLogs(req.params.id as string);
    res.json({ success: true, data: logs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
