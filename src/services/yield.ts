import api from './api';

export async function depositToVault(amount: string) {
  const { data } = await api.post('/yield/defi/deposit', { amount });
  return data.data as { txHash: string; amount: string };
}

export async function harvestYield(toAddress: string) {
  const { data } = await api.post('/yield/defi/harvest', { toAddress });
  return data.data as { txHash: string; to: string };
}

export async function getAccruedYield(address: string) {
  const { data } = await api.get(`/yield/defi/accrued/${address}`);
  return data.data as { accruedYield: string };
}

export async function getUSYCPrice() {
  const { data } = await api.get('/yield/usyc/price');
  return data.data as { price: string; apy: string; lastUpdated: string };
}

export async function deployToUSYC(amount: string, asset: string) {
  const { data } = await api.post('/yield/usyc/deploy', { amount, asset });
  return data.data as {
    subscriptionId: string;
    amount: string;
    asset: string;
    status: string;
    estimatedShares: string;
    message: string;
  };
}

export async function redeemUSYC(
  amount: string,
  flow: string = 'portal',
  sourceChain: string = 'Arc',
  destinationChain: string = 'Arc',
) {
  const { data } = await api.post('/yield/usyc/redeem', { amount, flow, sourceChain, destinationChain });
  return data.data as {
    redemptionId: string;
    amount: string;
    receivedAmount: string;
    receivedAsset: string;
    flow: string;
    status: string;
    message: string;
  };
}
