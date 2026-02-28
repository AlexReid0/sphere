import api from './api';

export interface BridgeQuote {
  estimatedFee: string;
  estimatedTime: string;
  sourceChain: string;
  destinationChain: string;
  amount: string;
}

export interface BridgeResult {
  messageHash: string;
  txHash: string;
  sourceChain: string;
  destinationChain: string;
  amount: string;
  status: string;
}

export async function getSupportedChains() {
  const { data } = await api.get('/bridge/chains');
  return data.data as Array<{ id: string; name: string; domain: number }>;
}

export async function getBridgeQuote(
  amount: string,
  sourceChain: string,
  destinationChain: string,
) {
  const { data } = await api.post('/bridge/quote', { amount, sourceChain, destinationChain });
  return data.data as BridgeQuote;
}

export async function executeBridge(
  amount: string,
  sourceChain: string,
  destinationChain: string,
  destinationAddress: string,
) {
  const { data } = await api.post('/bridge/execute', {
    amount, sourceChain, destinationChain, destinationAddress,
  });
  return data.data as BridgeResult;
}

export async function getBridgeStatus(messageHash: string) {
  const { data } = await api.get(`/bridge/status/${messageHash}`);
  return data.data as {
    messageHash: string;
    status: string;
    sourceTxHash: string | null;
    destinationTxHash: string | null;
  };
}
