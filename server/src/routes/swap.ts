import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getSwapQuote, executeSwap } from '../services/contracts.js';
import { getStableFXQuote, executeStableFXTrade } from '../services/circle.js';
import { getDb } from '../db/index.js';

const router = Router();

// POST /api/swap/quote — Get swap quote from onchain AMM
router.post('/quote', async (req: Request, res: Response) => {
  try {
    const { tokenIn, tokenOut, amountIn } = req.body;

    if (!tokenIn || !tokenOut || !amountIn) {
      return res.status(400).json({ success: false, error: 'Missing tokenIn, tokenOut, or amountIn' });
    }

    const quote = await getSwapQuote(tokenIn, tokenOut, amountIn);
    res.json({ success: true, data: quote });
  } catch (error: any) {
    console.error('Swap quote error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/swap/execute — Execute swap on SphereSwapRouter
router.post('/execute', async (req: Request, res: Response) => {
  try {
    const { tokenIn, tokenOut, amountIn, minAmountOut, slippage } = req.body;

    if (!tokenIn || !tokenOut || !amountIn) {
      return res.status(400).json({ success: false, error: 'Missing swap parameters' });
    }

    // If no minAmountOut, calculate from slippage
    let minOut = minAmountOut;
    if (!minOut && slippage) {
      const quote = await getSwapQuote(tokenIn, tokenOut, amountIn);
      const slippageFactor = 1 - parseFloat(slippage) / 100;
      minOut = (parseFloat(quote.amountOut) * slippageFactor).toString();
    }
    if (!minOut) minOut = '0';

    const result = await executeSwap(tokenIn, tokenOut, amountIn, minOut);

    // Log transaction
    const db = getDb();
    db.prepare(`
      INSERT INTO transactions (id, type, tx_hash, status, data_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), 'swap', result.txHash, 'confirmed', JSON.stringify({
      tokenIn, tokenOut, amountIn, minAmountOut: minOut,
    }));

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Swap execute error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/swap/stablefx/quote — Get Circle StableFX quote
router.post('/stablefx/quote', async (req: Request, res: Response) => {
  try {
    const { fromStable, toStable, amount, tenor } = req.body;

    if (!fromStable || !toStable || !amount) {
      return res.status(400).json({ success: false, error: 'Missing StableFX parameters' });
    }

    const quote = await getStableFXQuote(fromStable, toStable, amount, tenor || 'instant');
    res.json({ success: true, data: quote });
  } catch (error: any) {
    console.error('StableFX quote error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/swap/stablefx/execute — Execute Circle StableFX trade
router.post('/stablefx/execute', async (req: Request, res: Response) => {
  try {
    const { quoteId } = req.body;

    if (!quoteId) {
      return res.status(400).json({ success: false, error: 'Missing quoteId' });
    }

    const result = await executeStableFXTrade(quoteId);

    // Log transaction
    const db = getDb();
    db.prepare(`
      INSERT INTO transactions (id, type, tx_hash, status, data_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), 'stablefx_trade', result.txHash || '', 'confirmed', JSON.stringify({
      quoteId, tradeId: result.tradeId,
    }));

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('StableFX execute error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
