import api from './api';

export interface SwapQuote {
  amountIn: string;
  amountOut: string;
  tokenIn: string;
  tokenOut: string;
  rate: string;
  priceImpact: string;
  fee: string;
}

export interface StableFXQuote {
  quoteId: string;
  rate: string;
  fee: string;
  receiveAmount: string;
  expiry: string;
}

export async function getSwapQuote(tokenIn: string, tokenOut: string, amountIn: string) {
  const { data } = await api.post('/swap/quote', { tokenIn, tokenOut, amountIn });
  return data.data as SwapQuote;
}

export async function executeSwap(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  slippage: string,
) {
  const { data } = await api.post('/swap/execute', { tokenIn, tokenOut, amountIn, slippage });
  return data.data as { txHash: string; tokenIn: string; tokenOut: string; amountIn: string };
}

export async function getStableFXQuote(
  fromStable: string,
  toStable: string,
  amount: string,
  tenor: string = 'instant',
) {
  const { data } = await api.post('/swap/stablefx/quote', { fromStable, toStable, amount, tenor });
  return data.data as StableFXQuote;
}

export async function executeStableFXTrade(quoteId: string) {
  const { data } = await api.post('/swap/stablefx/execute', { quoteId });
  return data.data as { tradeId: string; status: string; txHash: string | null };
}
