import api from './api';

export interface AgentLog {
  timestamp: number;
  type: 'log' | 'web' | 'trade' | 'error';
  message: string;
}

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

export async function startAgent(
  nodeId: string,
  instructions: string,
  budget: string,
  token: string = 'USDC',
) {
  const { data } = await api.post('/agent/start', { nodeId, instructions, budget, token });
  return data.data as { sessionId: string; status: string; budget: string };
}

export async function stopAgent(sessionId: string) {
  const { data } = await api.post(`/agent/${sessionId}/stop`);
  return data.data as { stopped: boolean };
}

export async function getAgentStatus(sessionId: string) {
  const { data } = await api.get(`/agent/${sessionId}/status`);
  return data.data as AgentSession;
}

export async function getAgentLogs(sessionId: string) {
  const { data } = await api.get(`/agent/${sessionId}/logs`);
  return data.data as AgentLog[];
}
