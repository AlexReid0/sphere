import { Router, Request, Response } from 'express';
import { getBridgeQuote, executeBridge, getBridgeStatus, SUPPORTED_CHAINS } from '../services/bridge.js';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index.js';

const router = Router();

// GET /api/bridge/chains — List supported chains
router.get('/chains', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: Object.entries(SUPPORTED_CHAINS).map(([key, val]) => ({
      id: key,
      name: val.name,
      domain: val.domain,
    })),
  });
});

// POST /api/bridge/quote — Get CCTP bridge quote
router.post('/quote', async (req: Request, res: Response) => {
  try {
    const { amount, sourceChain, destinationChain } = req.body;

    if (!amount || !sourceChain || !destinationChain) {
      return res.status(400).json({ success: false, error: 'Missing amount, sourceChain, or destinationChain' });
    }

    const quote = await getBridgeQuote(amount, sourceChain, destinationChain);
    res.json({ success: true, data: quote });
  } catch (error: any) {
    console.error('Bridge quote error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/bridge/execute — Execute cross-chain USDC transfer
router.post('/execute', async (req: Request, res: Response) => {
  try {
    const { amount, sourceChain, destinationChain, destinationAddress } = req.body;

    if (!amount || !sourceChain || !destinationChain || !destinationAddress) {
      return res.status(400).json({ success: false, error: 'Missing bridge parameters' });
    }

    const result = await executeBridge(amount, sourceChain, destinationChain, destinationAddress);

    const db = getDb();
    db.prepare(`
      INSERT INTO transactions (id, type, tx_hash, status, data_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), 'bridge', result.txHash, 'pending', JSON.stringify({
      amount, sourceChain, destinationChain, destinationAddress, messageHash: result.messageHash,
    }));

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Bridge execute error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/bridge/status/:messageHash — Check bridge transfer status
router.get('/status/:messageHash', async (req: Request, res: Response) => {
  try {
    const status = await getBridgeStatus(req.params.messageHash as string);
    res.json({ success: true, data: status });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
