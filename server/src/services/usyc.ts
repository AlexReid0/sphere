import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const HASHNOTE_API = 'https://usyc.hashnote.com';

// ─── USYC Price Data ───

export async function getUSYCPrice() {
  try {
    const { data } = await axios.get(`${HASHNOTE_API}/api/prices/current`, {
      timeout: 5000,
    });

    return {
      price: data.price || data.nav || '1.0',
      apy: data.apy || data.yield || '5.1',
      lastUpdated: data.timestamp || new Date().toISOString(),
    };
  } catch (error: any) {
    console.error('USYC price fetch error:', error.message);
    // Fallback mock data (USYC backed by T-bills, typically near $1 with ~5% yield)
    return {
      price: '1.0432',
      apy: '5.10',
      lastUpdated: new Date().toISOString(),
    };
  }
}

export async function getUSYCHistoricalPrices(days: number = 30) {
  try {
    const { data } = await axios.get(`${HASHNOTE_API}/api/prices/historical`, {
      params: { days },
      timeout: 5000,
    });
    return data.prices || [];
  } catch (error: any) {
    console.error('USYC historical prices error:', error.message);
    // Generate mock historical data
    const prices = [];
    const now = Date.now();
    for (let i = days; i >= 0; i--) {
      prices.push({
        date: new Date(now - i * 86400000).toISOString().split('T')[0],
        price: (1.04 + Math.random() * 0.01).toFixed(4),
      });
    }
    return prices;
  }
}

// ─── USYC Deployment (Teller Contract) ───

export async function deployToUSYC(amount: string, asset: string) {
  // In production: interact with Hashnote's Teller smart contract
  // For testnet: simulate the subscription flow
  const subscriptionId = `sub_${uuidv4().slice(0, 12)}`;

  return {
    subscriptionId,
    amount,
    asset,
    status: 'pending_confirmation',
    estimatedShares: (parseFloat(amount.replace(/,/g, '')) / 1.04).toFixed(2),
    message: `Subscription request for ${amount} ${asset} → USYC submitted`,
  };
}

// ─── USYC Redemption ───

export async function redeemUSYC(
  amount: string,
  flow: 'portal' | 'contracts' = 'portal',
  sourceChain: string = 'Arc',
  destinationChain: string = 'Arc',
) {
  const redemptionId = `rdm_${uuidv4().slice(0, 12)}`;
  const parsedAmount = parseFloat(amount.replace(/,/g, ''));
  const usdcValue = (parsedAmount * 1.04).toFixed(2); // USYC → USDC at current price

  return {
    redemptionId,
    amount,
    receivedAmount: usdcValue,
    receivedAsset: 'USDC',
    flow,
    sourceChain,
    destinationChain,
    status: 'processing',
    estimatedSettlement: flow === 'portal' ? 'T+1' : 'Instant',
    message: `Redemption of ${amount} USYC → ${usdcValue} USDC via ${flow}`,
  };
}

// ─── Whitelist Check ───

export async function checkWhitelistStatus(address: string): Promise<boolean> {
  // In production: check with Hashnote's whitelist contract
  // For testnet: always whitelisted
  return true;
}
