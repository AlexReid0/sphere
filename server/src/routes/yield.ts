import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { depositToYieldVault, harvestYield, getAccruedYield, getVaultDeposit } from '../services/contracts.js';
import { getUSYCPrice, getUSYCHistoricalPrices, deployToUSYC, redeemUSYC, checkWhitelistStatus } from '../services/usyc.js';
import { getDb } from '../db/index.js';

const router = Router();

// POST /api/yield/defi/deposit — Deposit to SphereYieldVault
router.post('/defi/deposit', async (req: Request, res: Response) => {
  try {
    const { amount } = req.body;

    if (!amount) {
      return res.status(400).json({ success: false, error: 'Missing amount' });
    }

    const result = await depositToYieldVault(amount);

    const db = getDb();
    db.prepare(`
      INSERT INTO transactions (id, type, tx_hash, status, data_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), 'yield_deposit', result.txHash, 'confirmed', JSON.stringify({ amount }));

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Yield deposit error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/yield/defi/harvest — Harvest yield to wallet
router.post('/defi/harvest', async (req: Request, res: Response) => {
  try {
    const { toAddress } = req.body;

    if (!toAddress) {
      return res.status(400).json({ success: false, error: 'Missing toAddress' });
    }

    const result = await harvestYield(toAddress);

    const db = getDb();
    db.prepare(`
      INSERT INTO transactions (id, type, tx_hash, status, data_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), 'yield_harvest', result.txHash, 'confirmed', JSON.stringify({ toAddress }));

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Yield harvest error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/yield/defi/accrued/:address — Get accrued yield
router.get('/defi/accrued/:address', async (req: Request, res: Response) => {
  try {
    const yield_ = await getAccruedYield(req.params.address as string);
    res.json({ success: true, data: { accruedYield: yield_ } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/yield/defi/deposit/:address — Get vault deposit info
router.get('/defi/deposit/:address', async (req: Request, res: Response) => {
  try {
    const deposit = await getVaultDeposit(req.params.address as string);
    res.json({ success: true, data: deposit });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/yield/usyc/price — Get current USYC price
router.get('/usyc/price', async (_req: Request, res: Response) => {
  try {
    const priceData = await getUSYCPrice();
    res.json({ success: true, data: priceData });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/yield/usyc/history — Get USYC historical prices
router.get('/usyc/history', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const prices = await getUSYCHistoricalPrices(days);
    res.json({ success: true, data: prices });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/yield/usyc/deploy — Deploy funds to USYC
router.post('/usyc/deploy', async (req: Request, res: Response) => {
  try {
    const { amount, asset } = req.body;

    if (!amount || !asset) {
      return res.status(400).json({ success: false, error: 'Missing amount or asset' });
    }

    const result = await deployToUSYC(amount, asset);

    const db = getDb();
    db.prepare(`
      INSERT INTO transactions (id, type, tx_hash, status, data_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), 'usyc_deploy', '', 'confirmed', JSON.stringify({
      amount, asset, subscriptionId: result.subscriptionId,
    }));

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('USYC deploy error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/yield/usyc/redeem — Redeem USYC
router.post('/usyc/redeem', async (req: Request, res: Response) => {
  try {
    const { amount, flow, sourceChain, destinationChain } = req.body;

    if (!amount) {
      return res.status(400).json({ success: false, error: 'Missing amount' });
    }

    const result = await redeemUSYC(amount, flow, sourceChain, destinationChain);

    const db = getDb();
    db.prepare(`
      INSERT INTO transactions (id, type, tx_hash, status, data_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), 'usyc_redeem', '', 'confirmed', JSON.stringify({
      amount, flow, redemptionId: result.redemptionId,
    }));

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('USYC redeem error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/yield/usyc/whitelist/:address — Check whitelist status
router.get('/usyc/whitelist/:address', async (req: Request, res: Response) => {
  try {
    const isWhitelisted = await checkWhitelistStatus(req.params.address as string);
    res.json({ success: true, data: { whitelisted: isWhitelisted } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
