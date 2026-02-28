import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createProgrammableWallet, getWalletBalance } from '../services/circle.js';
import { mintTestTokens, getAllBalances } from '../services/contracts.js';
import { getDb } from '../db/index.js';

const router = Router();

// POST /api/wallet/create — Create a new Circle Programmable Wallet
router.post('/create', async (req: Request, res: Response) => {
  try {
    const { label } = req.body;
    const wallet = await createProgrammableWallet(label || 'Sphere Wallet');

    // Persist to DB
    const db = getDb();
    const id = uuidv4();
    db.prepare(`
      INSERT INTO wallets (id, circle_wallet_id, address, label)
      VALUES (?, ?, ?, ?)
    `).run(id, wallet.circleWalletId, wallet.address, label || 'Sphere Wallet');

    res.json({
      success: true,
      data: {
        id,
        circleWalletId: wallet.circleWalletId,
        address: wallet.address,
        blockchain: wallet.blockchain,
      },
    });
  } catch (error: any) {
    console.error('Wallet creation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/wallet/:address/balance — Get token balances
router.get('/:address/balance', async (req: Request, res: Response) => {
  try {
    const address = req.params.address as string;

    // Get onchain balances
    const balances = await getAllBalances(address);

    // Also try Circle API balance
    const db = getDb();
    const walletRow = db.prepare('SELECT circle_wallet_id FROM wallets WHERE address = ?').get(address) as any;

    let circleBalances: any[] = [];
    if (walletRow?.circle_wallet_id) {
      circleBalances = await getWalletBalance(walletRow.circle_wallet_id);
    }

    res.json({
      success: true,
      data: {
        address,
        onchainBalances: balances,
        circleBalances,
      },
    });
  } catch (error: any) {
    console.error('Balance fetch error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/wallet/deposit — Mint testnet tokens to wallet
router.post('/deposit', async (req: Request, res: Response) => {
  try {
    const { address, token, amount } = req.body;

    if (!address || !token || !amount) {
      return res.status(400).json({ success: false, error: 'Missing address, token, or amount' });
    }

    const result = await mintTestTokens(address, token, amount);

    // Log transaction
    const db = getDb();
    db.prepare(`
      INSERT INTO transactions (id, type, tx_hash, status, data_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), 'deposit', result.txHash, 'confirmed', JSON.stringify({ address, token, amount }));

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Deposit error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/wallet/list — List all wallets
router.get('/list', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const wallets = db.prepare('SELECT * FROM wallets ORDER BY created_at DESC').all();
    res.json({ success: true, data: wallets });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
