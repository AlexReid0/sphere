CREATE TABLE IF NOT EXISTS wallets (
  id TEXT PRIMARY KEY,
  circle_wallet_id TEXT,
  address TEXT NOT NULL,
  label TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  tx_hash TEXT,
  status TEXT DEFAULT 'pending',
  node_id TEXT,
  data_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  type TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  next_run TEXT,
  data_json TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_sessions (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  status TEXT DEFAULT 'idle',
  instructions TEXT,
  budget TEXT DEFAULT '0',
  used_budget TEXT DEFAULT '0',
  logs_json TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
