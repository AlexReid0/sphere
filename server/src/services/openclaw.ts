import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index.js';
import { fundAgentWallet, stopAgentAndRefund, getAgentBudgetStatus } from './contracts.js';

// OpenClaw Agent Integration
// OpenClaw is Circle's framework for AI agent-powered applications

export interface AgentSession {
  id: string;
  nodeId: string;
  status: 'idle' | 'running' | 'stopped' | 'completed';
  instructions: string;
  budget: string;
  usedBudget: string;
  logs: AgentLog[];
  createdAt: string;
}

export interface AgentLog {
  timestamp: number;
  type: 'log' | 'web' | 'trade' | 'error';
  message: string;
}

// Simulated agent execution steps (in production, these would come from OpenClaw SDK)
const AGENT_EXECUTION_STEPS: Array<{ type: AgentLog['type']; message: string; budgetDelta?: number }> = [
  { type: 'log', message: 'Initializing agent session...' },
  { type: 'log', message: 'Parsing instructions and setting up execution context...' },
  { type: 'web', message: 'Scanning dexscreener.com for market data...' },
  { type: 'log', message: 'Analyzing token metrics: volume, liquidity, holder distribution...' },
  { type: 'web', message: 'Checking defillama.com for TVL trends...' },
  { type: 'log', message: 'Identified 3 potential opportunities matching criteria.' },
  { type: 'web', message: 'Verifying contract safety on gopluslabs.io...' },
  { type: 'trade', message: 'Executing trade: Swap 400 USDC → target token', budgetDelta: 400 },
  { type: 'log', message: 'Trade confirmed. Monitoring position...' },
  { type: 'trade', message: 'Setting stop-loss at -5% and take-profit at +15%', budgetDelta: 0 },
  { type: 'log', message: 'Position monitoring active. Next check in 30s.' },
  { type: 'log', message: 'Agent cycle complete. Summarizing results...' },
];

// Active agent intervals (in-memory for simplicity)
const activeAgents: Map<string, NodeJS.Timeout> = new Map();

// ─── Start Agent Session ───

export async function startAgentSession(
  nodeId: string,
  instructions: string,
  budget: string,
  token: string = 'USDC',
): Promise<AgentSession> {
  const db = getDb();
  const sessionId = `agent_${uuidv4().slice(0, 12)}`;

  // Fund the agent wallet contract
  try {
    await fundAgentWallet(token, budget);
  } catch (error) {
    console.error('Failed to fund agent wallet onchain:', error);
    // Continue with session creation even if onchain funding fails (testnet)
  }

  const session: AgentSession = {
    id: sessionId,
    nodeId,
    status: 'running',
    instructions,
    budget,
    usedBudget: '0',
    logs: [],
    createdAt: new Date().toISOString(),
  };

  // Persist to DB
  db.prepare(`
    INSERT INTO agent_sessions (id, node_id, status, instructions, budget, used_budget, logs_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(sessionId, nodeId, 'running', instructions, budget, '0', '[]');

  // Start simulated execution
  startAgentExecution(sessionId);

  return session;
}

// ─── Simulated Agent Execution ───

function startAgentExecution(sessionId: string) {
  const db = getDb();
  let stepIndex = 0;
  let usedBudget = 0;

  const interval = setInterval(() => {
    if (stepIndex >= AGENT_EXECUTION_STEPS.length) {
      // Agent completed
      clearInterval(interval);
      activeAgents.delete(sessionId);

      const finalLog: AgentLog = {
        timestamp: Date.now(),
        type: 'log',
        message: 'Agent session completed successfully.',
      };

      const session = db.prepare('SELECT logs_json, budget FROM agent_sessions WHERE id = ?').get(sessionId) as any;
      const logs = JSON.parse(session?.logs_json || '[]');
      logs.push(finalLog);

      db.prepare(`
        UPDATE agent_sessions SET status = 'completed', used_budget = ?, logs_json = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(usedBudget.toString(), JSON.stringify(logs), sessionId);

      return;
    }

    const step = AGENT_EXECUTION_STEPS[stepIndex];
    const log: AgentLog = {
      timestamp: Date.now(),
      type: step.type,
      message: step.message,
    };

    if (step.budgetDelta) {
      usedBudget += step.budgetDelta;
    }

    // Append log to DB
    const session = db.prepare('SELECT logs_json FROM agent_sessions WHERE id = ?').get(sessionId) as any;
    const logs = JSON.parse(session?.logs_json || '[]');
    logs.push(log);

    db.prepare(`
      UPDATE agent_sessions SET logs_json = ?, used_budget = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(JSON.stringify(logs), usedBudget.toString(), sessionId);

    stepIndex++;
  }, 800); // ~800ms per step

  activeAgents.set(sessionId, interval);
}

// ─── Stop Agent Session ───

export async function stopAgentSession(sessionId: string): Promise<void> {
  const db = getDb();

  // Stop the execution interval
  const interval = activeAgents.get(sessionId);
  if (interval) {
    clearInterval(interval);
    activeAgents.delete(sessionId);
  }

  // Try to refund onchain budget
  try {
    await stopAgentAndRefund('USDC');
  } catch (error) {
    console.error('Failed to stop/refund agent onchain:', error);
  }

  // Add stop log
  const session = db.prepare('SELECT logs_json FROM agent_sessions WHERE id = ?').get(sessionId) as any;
  const logs = JSON.parse(session?.logs_json || '[]');
  logs.push({
    timestamp: Date.now(),
    type: 'log',
    message: 'Agent session stopped by user.',
  });

  db.prepare(`
    UPDATE agent_sessions SET status = 'stopped', logs_json = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(JSON.stringify(logs), sessionId);
}

// ─── Get Agent Status ───

export async function getAgentStatus(sessionId: string): Promise<AgentSession | null> {
  const db = getDb();
  const row = db.prepare('SELECT * FROM agent_sessions WHERE id = ?').get(sessionId) as any;
  if (!row) return null;

  // Try to get onchain budget status
  let onchainStatus = null;
  try {
    onchainStatus = await getAgentBudgetStatus('USDC');
  } catch {
    // Onchain status not available
  }

  return {
    id: row.id,
    nodeId: row.node_id,
    status: row.status,
    instructions: row.instructions,
    budget: onchainStatus?.budget || row.budget,
    usedBudget: onchainStatus?.spent || row.used_budget,
    logs: JSON.parse(row.logs_json || '[]'),
    createdAt: row.created_at,
  };
}

// ─── Get Agent Logs ───

export async function getAgentLogs(sessionId: string): Promise<AgentLog[]> {
  const db = getDb();
  const row = db.prepare('SELECT logs_json FROM agent_sessions WHERE id = ?').get(sessionId) as any;
  if (!row) return [];
  return JSON.parse(row.logs_json || '[]');
}
