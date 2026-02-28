import api from './api';

export async function executeDistribution(
  token: string,
  recipients: string[],
  amounts: string[],
) {
  const { data } = await api.post('/distribute/execute', { token, recipients, amounts });
  return data.data as {
    txHash: string;
    token: string;
    recipients: number;
    totalAmount: string;
  };
}

export async function scheduleDistribution(
  nodeId: string,
  schedule: string,
  executionDay: string | undefined,
  token: string,
  recipients: string[],
  amounts: string[],
) {
  const { data } = await api.post('/distribute/schedule', {
    nodeId, schedule, executionDay, token, recipients, amounts,
  });
  return data.data as { jobId: string; schedule: string };
}

export async function getScheduledDistributions(nodeId?: string) {
  const { data } = await api.get('/distribute/scheduled', { params: { nodeId } });
  return data.data as Array<{
    id: string;
    nodeId: string;
    type: string;
    cronExpression: string;
    data: any;
    active: boolean;
  }>;
}

export async function cancelScheduledDistribution(jobId: string) {
  const { data } = await api.delete(`/distribute/scheduled/${jobId}`);
  return data.data as { cancelled: boolean };
}
