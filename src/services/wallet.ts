import api from './api';

export async function createWallet(label: string) {
  const { data } = await api.post('/wallet/create', { label });
  return data.data as {
    id: string;
    circleWalletId: string;
    address: string;
    blockchain: string;
  };
}

export async function getBalance(address: string) {
  const { data } = await api.get(`/wallet/${address}/balance`);
  return data.data as {
    address: string;
    onchainBalances: Record<string, string>;
    circleBalances: any[];
  };
}

export async function deposit(address: string, token: string, amount: string) {
  const { data } = await api.post('/wallet/deposit', { address, token, amount });
  return data.data as { txHash: string; amount: string; symbol: string };
}
