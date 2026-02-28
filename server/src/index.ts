import express from 'express';
import cors from 'cors';
import { PORT, ARC_RPC_URL, ARC_CHAIN_ID, signer } from './config.js';
import { getDb } from './db/index.js';
import { restoreScheduledJobs } from './services/scheduler.js';

// Route imports
import walletRoutes from './routes/wallet.js';
import swapRoutes from './routes/swap.js';
import yieldRoutes from './routes/yield.js';
import distributeRoutes from './routes/distribute.js';
import agentRoutes from './routes/agent.js';
import bridgeRoutes from './routes/bridge.js';

const app = express();

// ─── Middleware ───
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3000'] }));
app.use(express.json());

// ─── Health Check ───
app.get('/api/health', async (_req, res) => {
  const signerAddr = signer ? await signer.getAddress() : 'No signer configured';
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    chain: {
      rpc: ARC_RPC_URL,
      chainId: ARC_CHAIN_ID,
      signer: signerAddr,
    },
  });
});

// ─── API Routes ───
app.use('/api/wallet', walletRoutes);
app.use('/api/swap', swapRoutes);
app.use('/api/yield', yieldRoutes);
app.use('/api/distribute', distributeRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/bridge', bridgeRoutes);

// ─── Transactions History ───
app.get('/api/transactions', (_req, res) => {
  try {
    const db = getDb();
    const limit = parseInt(_req.query.limit as string) || 50;
    const txs = db.prepare('SELECT * FROM transactions ORDER BY created_at DESC LIMIT ?').all(limit);
    res.json({ success: true, data: txs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Start Server ───
app.listen(PORT, () => {
  console.log(`\n  ┌─────────────────────────────────────────┐`);
  console.log(`  │  Sphere Backend Server                   │`);
  console.log(`  │  Port: ${PORT}                              │`);
  console.log(`  │  Chain: ARC Testnet (${ARC_CHAIN_ID})          │`);
  console.log(`  │  RPC: ${ARC_RPC_URL.slice(0, 35)}... │`);
  console.log(`  └─────────────────────────────────────────┘\n`);

  // Initialize DB
  getDb();
  console.log('  Database initialized');

  // Restore scheduled jobs
  restoreScheduledJobs();

  console.log('  Server ready!\n');
});

export default app;
