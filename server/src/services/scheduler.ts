import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index.js';
import { executeDistribution, executeSwap } from './contracts.js';

interface ScheduledJob {
  id: string;
  nodeId: string;
  type: 'distribution' | 'swap';
  cronExpression: string;
  data: any;
  active: boolean;
}

// Active cron tasks (in-memory)
const activeTasks: Map<string, cron.ScheduledTask> = new Map();

// ─── Schedule a Distribution ───

export function scheduleDistribution(
  nodeId: string,
  schedule: string,
  executionDay: string | undefined,
  data: {
    token: string;
    recipients: string[];
    amounts: string[];
  },
): string {
  const jobId = `job_${uuidv4().slice(0, 12)}`;
  const cronExpr = scheduleToCron(schedule, executionDay);

  const db = getDb();
  db.prepare(`
    INSERT INTO scheduled_jobs (id, node_id, type, cron_expression, data_json, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(jobId, nodeId, 'distribution', cronExpr, JSON.stringify(data));

  // Register the cron task
  const task = cron.schedule(cronExpr, async () => {
    console.log(`[Scheduler] Executing distribution ${jobId} for node ${nodeId}`);
    try {
      await executeDistribution(data.token, data.recipients, data.amounts);
      console.log(`[Scheduler] Distribution ${jobId} completed`);
    } catch (error) {
      console.error(`[Scheduler] Distribution ${jobId} failed:`, error);
    }
  });

  activeTasks.set(jobId, task);
  return jobId;
}

// ─── Schedule a Swap ───

export function scheduleSwap(
  nodeId: string,
  schedule: string,
  executionDay: string | undefined,
  data: {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    minAmountOut: string;
  },
): string {
  const jobId = `job_${uuidv4().slice(0, 12)}`;
  const cronExpr = scheduleToCron(schedule, executionDay);

  const db = getDb();
  db.prepare(`
    INSERT INTO scheduled_jobs (id, node_id, type, cron_expression, data_json, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(jobId, nodeId, 'swap', cronExpr, JSON.stringify(data));

  const task = cron.schedule(cronExpr, async () => {
    console.log(`[Scheduler] Executing swap ${jobId} for node ${nodeId}`);
    try {
      await executeSwap(data.tokenIn, data.tokenOut, data.amountIn, data.minAmountOut);
      console.log(`[Scheduler] Swap ${jobId} completed`);
    } catch (error) {
      console.error(`[Scheduler] Swap ${jobId} failed:`, error);
    }
  });

  activeTasks.set(jobId, task);
  return jobId;
}

// ─── Cancel a Scheduled Job ───

export function cancelSchedule(jobId: string): boolean {
  const task = activeTasks.get(jobId);
  if (task) {
    task.stop();
    activeTasks.delete(jobId);
  }

  const db = getDb();
  const result = db.prepare('UPDATE scheduled_jobs SET active = 0 WHERE id = ?').run(jobId);
  return result.changes > 0;
}

// ─── List Scheduled Jobs ───

export function listScheduledJobs(nodeId?: string): ScheduledJob[] {
  const db = getDb();
  let rows;
  if (nodeId) {
    rows = db.prepare('SELECT * FROM scheduled_jobs WHERE active = 1 AND node_id = ?').all(nodeId) as any[];
  } else {
    rows = db.prepare('SELECT * FROM scheduled_jobs WHERE active = 1').all() as any[];
  }

  return rows.map((row: any) => ({
    id: row.id,
    nodeId: row.node_id,
    type: row.type,
    cronExpression: row.cron_expression,
    data: JSON.parse(row.data_json || '{}'),
    active: Boolean(row.active),
  }));
}

// ─── Restore Jobs on Startup ───

export function restoreScheduledJobs() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM scheduled_jobs WHERE active = 1').all() as any[];

  for (const row of rows) {
    const data = JSON.parse(row.data_json || '{}');
    const task = cron.schedule(row.cron_expression, async () => {
      console.log(`[Scheduler] Executing ${row.type} ${row.id}`);
      try {
        if (row.type === 'distribution') {
          await executeDistribution(data.token, data.recipients, data.amounts);
        } else if (row.type === 'swap') {
          await executeSwap(data.tokenIn, data.tokenOut, data.amountIn, data.minAmountOut);
        }
      } catch (error) {
        console.error(`[Scheduler] Job ${row.id} failed:`, error);
      }
    });
    activeTasks.set(row.id, task);
  }

  console.log(`[Scheduler] Restored ${rows.length} scheduled jobs`);
}

// ─── Convert schedule string to cron expression ───

function scheduleToCron(schedule: string, executionDay?: string): string {
  switch (schedule) {
    case 'Daily':
      return '0 9 * * *'; // 9 AM every day
    case 'Weekly': {
      const dayMap: Record<string, number> = {
        Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
        Thursday: 4, Friday: 5, Saturday: 6,
      };
      const dow = dayMap[executionDay || 'Monday'] ?? 1;
      return `0 9 * * ${dow}`; // 9 AM on specified day
    }
    case 'Biweekly': {
      const dayMap2: Record<string, number> = {
        Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
        Thursday: 4, Friday: 5, Saturday: 6,
      };
      const dow2 = dayMap2[executionDay || 'Friday'] ?? 5;
      return `0 9 1,15 * ${dow2}`; // 1st and 15th that fall on the specified day
    }
    case 'Monthly': {
      const dom = parseInt(executionDay || '1');
      return `0 9 ${dom} * *`; // 9 AM on specified day of month
    }
    case 'Quarterly': {
      const dom2 = parseInt(executionDay || '1');
      return `0 9 ${dom2} 1,4,7,10 *`; // Jan, Apr, Jul, Oct
    }
    default:
      return '0 9 * * *'; // Default: daily
  }
}
