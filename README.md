<p align="center">
  <img src="https://img.shields.io/badge/ARC_Testnet-5042002-blue" alt="Chain" />
  <img src="https://img.shields.io/badge/Solidity-0.8.20-363636" alt="Solidity" />
  <img src="https://img.shields.io/badge/React-18-61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/Circle-Programmable_Wallets-00D395" alt="Circle" />
  <img src="https://img.shields.io/badge/Hashnote-USYC-8B5CF6" alt="USYC" />
</p>

# Sphere

**Visual treasury intelligence for onchain finance.**

Sphere lets you design, execute, and automate complex treasury operations through a drag-and-drop node graph. Connect swap, yield, distribution, and wallet nodes to build programmable money flows — backed by real smart contracts, Circle's Programmable Wallets, StableFX, Hashnote USYC, and CCTP bridging.

---

## The Problem

Corporate treasury teams and DAOs manage millions across fragmented tools:

- **Swaps** live on one DEX interface
- **Yield** strategies require a separate protocol dashboard
- **Payroll** runs through yet another disbursement tool
- **FX conversions** between stablecoins need OTC desks or manual bridging
- **RWA yield** (T-bills, money markets) sits behind institutional portals

There's no unified view. No automation. No way to visualize how funds actually flow from wallet to swap to yield to payroll and back.

## The Solution

Sphere collapses the entire treasury stack into a single visual graph:

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   [ Main Wallet ]──→[ ETH Swap ]──→[ DeFi Yield ]──→[ Payroll ]   │
│        500K USDC       50K→ETH        4.2% APY       85K/month     │
│              │                                                      │
│              └──────→[ USYC Yield ]──→[ Treasury Wallet ]          │
│                        5.1% RWA           34.2K USDC               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

Each node is a real financial operation. Each connection is a real asset flow. Click a node to configure it, hit execute, and the transaction settles onchain.

---

## Features

### Node Types

| Node | Color | What It Does |
|------|-------|-------------|
| **Wallet** | Blue | Create Circle Programmable Wallets, view multi-asset balances, deposit funds |
| **Swap** | Orange | AMM token swaps (USDC/ETH/USDT/DAI) **or** StableFX currency conversion (USDC/EURC/JPYC) |
| **Yield** | Teal | DeFi vault deposits with harvest **or** Hashnote USYC for RWA T-bill yield |
| **Payroll** | Amber | Batch distributions to multiple recipients with cron scheduling |

### Dual-Mode Operations

**Swap Node** toggles between two engines:

- **Crypto Mode** — Onchain AMM via `SphereSwapRouter` (constant-product, 0.3% fee, slippage control)
- **StableFX Mode** — Circle's FX API for institutional stablecoin conversions (USDC ↔ EURC, JPYC, GBPC, CADC) with tenor-based pricing

**Yield Node** toggles between two strategies:

- **DeFi Mode** — `SphereYieldVault` smart contract with per-block yield accrual and harvest
- **RWA Mode** — Hashnote USYC (tokenized US Treasury notes, ~5.1% APY) with portal or instant redemption

### Automation

- Schedule any distribution or swap on a cron: daily, weekly, biweekly, monthly, quarterly
- Jobs persist in SQLite and restore automatically on server restart
- Execute once or set-and-forget recurring treasury operations

### Cross-Chain Bridging

- CCTP integration for USDC transfers across Ethereum, Avalanche, Arbitrum, Base, Polygon, and ARC
- Quote fees and estimated times before executing
- Track attestation status through to completion

---

## Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                    │
│                                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌──────────────┐  │
│  │ SphereCanvas │  │ ConnectionLyr│  │  NodePanel   │  │ActivityPanel │  │
│  │  (CSS 3D)   │  │  (SVG Bezier)│  │ (Edit/Exec)  │  │  (History)   │  │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         └────────────────┴─────────────────┴─────────────────┘           │
│                                    │                                      │
│                           Zustand Store                                   │
│                     (nodes, connections, history)                         │
│                                    │                                      │
│                          Frontend Services                                │
│                  wallet / swap / yield / distribute                       │
│                        agent / bridge                                     │
│                                    │                                      │
│                            Axios → /api                                   │
└────────────────────────────────────┼─────────────────────────────────────┘
                                     │
                              Vite Dev Proxy
                                     │
┌────────────────────────────────────┼─────────────────────────────────────┐
│                              BACKEND                                      │
│                                    │                                      │
│                          Express (port 3001)                              │
│                                    │                                      │
│         ┌──────────┬───────────┬───┴────┬────────────┬──────────┐        │
│         │          │           │        │            │          │         │
│      /wallet    /swap      /yield   /distribute   /agent    /bridge      │
│         │          │           │        │            │          │         │
│         ▼          ▼           ▼        ▼            ▼          ▼         │
│  ┌───────────────────────────────────────────────────────────────────┐   │
│  │                          SERVICES                                 │   │
│  │                                                                   │   │
│  │  circle.ts ─── Programmable Wallets + StableFX (Circle API)      │   │
│  │  contracts.ts ─ Swap / Distribute / Yield / Agent (ethers.js)    │   │
│  │  usyc.ts ───── USYC price + deploy + redeem (Hashnote API)      │   │
│  │  bridge.ts ─── CCTP cross-chain transfers (Circle CCTP)         │   │
│  │  openclaw.ts ── AI agent sessions (Circle OpenClaw)              │   │
│  │  scheduler.ts ─ Cron job management (node-cron)                  │   │
│  │                                                                   │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                          │                    │                           │
│                    ┌─────┴─────┐        ┌─────┴──────┐                   │
│                    │  SQLite   │        │ ARC Testnet │                   │
│                    │  (WAL)    │        │ Chain 5042002│                   │
│                    └───────────┘        └─────────────┘                   │
└──────────────────────────────────────────────────────────────────────────┘
```

### Smart Contract Architecture

```
                          ARC Testnet (Chain 5042002)
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  ┌──────────────┐     ┌───────────────────┐     ┌────────────────┐  │
│  │  MockERC20   │     │  SphereSwapRouter  │     │ SphereYieldVault│  │
│  │              │     │                   │     │                │  │
│  │  USDC (6)    │────▶│  addLiquidity()   │     │  deposit()     │  │
│  │  USDT (6)    │     │  swap()           │     │  withdraw()    │  │
│  │  DAI  (18)   │     │  getAmountOut()   │     │  harvest()     │  │
│  │  WETH (18)   │     │                   │     │  accruedYield()│  │
│  │              │     │  Pools:           │     │                │  │
│  │  mint()      │     │  USDC/WETH        │     │  Asset: USDC   │  │
│  │  faucet()    │     │  USDC/USDT        │     │  Rate: 0.01%/  │  │
│  └──────────────┘     │  USDC/DAI         │     │        block   │  │
│         │             └───────────────────┘     └────────────────┘  │
│         │                                                           │
│         │             ┌───────────────────┐     ┌────────────────┐  │
│         │             │SphereDistributor  │     │SphereAgentWallet│  │
│         └────────────▶│                   │     │                │  │
│                       │  distribute()     │     │  fund()        │  │
│                       │  transfer()       │     │  spend()       │  │
│                       │                   │     │  setAgent()    │  │
│                       │  Batch payroll    │     │  startSession()│  │
│                       │  in 1 TX          │     │  stopAndRefund│  │
│                       └───────────────────┘     └────────────────┘  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Data Flow: Swap Execution

```
  User clicks "Execute Swap" in NodePanel
                    │
                    ▼
          Frontend swap.ts
          executeSwap(USDC, WETH, 1000, 0.5%)
                    │
                    ▼
          POST /api/swap/execute
                    │
                    ▼
          contracts.ts executeSwap()
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
  MockERC20.approve()    SphereSwapRouter.swap()
  (grant router spend)   (constant-product AMM)
        │                       │
        └───────────┬───────────┘
                    ▼
          TX confirmed onchain
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
  Log to SQLite DB       Return txHash to frontend
                                │
                                ▼
                    confirmHistoryEntry(id)
                    (loading → confirmed in UI)
```

### Data Flow: StableFX Conversion

```
  User selects StableFX mode → "Get Quote"
                    │
                    ▼
          Frontend swap.ts
          getStableFXQuote(USDC, EURC, 10000, "instant")
                    │
                    ▼
          POST /api/swap/stablefx/quote
                    │
                    ▼
          circle.ts getStableFXQuote()
                    │
                    ▼
          Circle StableFX API
          Returns: { quoteId, rate: 0.92, fee: 0.15%, receiveAmount: 9185 }
                    │
                    ▼
          User reviews quote → "Confirm"
                    │
                    ▼
          POST /api/swap/stablefx/execute
                    │
                    ▼
          circle.ts executeStableFXTrade(quoteId)
                    │
                    ▼
          Circle settles FX trade
          USDC → EURC at institutional rate
```

### Data Flow: USYC RWA Yield

```
  User selects RWA mode → "Deploy to USYC"
                    │
                    ▼
          Frontend yield.ts
          deployToUSYC(50000, "USDC")
                    │
                    ▼
          POST /api/yield/usyc/deploy
                    │
                    ▼
          usyc.ts deployToUSYC()
                    │
                    ▼
          Hashnote Subscription
          50,000 USDC → ~48,077 USYC tokens
          ($1.04 per USYC, backed by US T-bills)
                    │
                    ▼
          Yield accrues at ~5.1% APY
          (actual US Treasury rate)
                    │
                    ▼
          User clicks "Redeem" (portal T+1 or instant)
                    │
                    ▼
          POST /api/yield/usyc/redeem
                    │
                    ▼
          USYC → USDC at current NAV
          Principal + yield returned
```

---

## How It Works

### 1. Build Your Flow

Drag nodes from the left palette onto the canvas. Connect them by dragging from an output port to an input port. Each connection represents a directional asset flow — USDC from a wallet into a swap, ETH from a swap into a yield vault, yield harvests into a payroll distributor.

### 2. Configure Each Node

Click any node to open its configuration panel. Every node type has specific parameters:

- **Wallet**: View balances, deposit testnet tokens, see your Circle wallet address
- **Swap**: Pick tokens, set amounts, choose between onchain AMM or StableFX, set slippage
- **Yield**: Choose DeFi vault or USYC RWA strategy, monitor accrued yield, harvest or redeem
- **Payroll**: Add recipients with addresses and amounts, choose a schedule, execute or automate

### 3. Execute or Schedule

Every operation has two paths:

- **Execute now**: One click triggers the onchain transaction. The activity panel shows real-time status (loading → confirmed) with a link to the block explorer.
- **Schedule**: Set a cron (daily, weekly, monthly) and the backend scheduler handles recurring execution automatically.

### 4. Monitor

The activity panel on the right shows:

- **History**: Every transaction with status, amounts, addresses, and explorer links
- **Upcoming**: Scheduled distributions, yield maturity dates, and time-locked swaps

---

## StableFX: Institutional FX for Stablecoins

StableFX is Circle's foreign exchange API for converting between stablecoin denominations at institutional rates.

```
┌────────────────────────────────────────────────────────┐
│                    StableFX Flow                        │
│                                                        │
│  ┌──────┐   quote    ┌────────────┐   settle   ┌────┐ │
│  │ USDC │──────────▶│  Circle FX  │──────────▶│EURC│ │
│  │10,000│   rate:0.92│   Engine    │  9,185    │    │ │
│  └──────┘   fee:0.15%└────────────┘           └────┘ │
│                                                        │
│  Supported pairs:                                      │
│  USDC ↔ EURC (Euro)                                   │
│  USDC ↔ JPYC (Yen)                                    │
│  USDC ↔ GBPC (Pound)                                  │
│  USDC ↔ CADC (CAD)                                    │
│                                                        │
│  Tenors:                                               │
│  instant  — immediate settlement, higher spread        │
│  hourly   — settles within the hour                    │
│  daily    — settles end of day, tightest spread        │
└────────────────────────────────────────────────────────┘
```

**Why it matters**: Treasuries holding USD stablecoins can convert to EUR, JPY, GBP, or CAD stablecoins without OTC desks, at transparent rates, directly from the Sphere graph.

---

## USYC: Real-World Asset Yield

USYC is Hashnote's tokenized US Treasury note product. Sphere integrates USYC so idle treasury USDC can earn ~5.1% APY backed by actual government securities.

```
┌──────────────────────────────────────────────────────────────┐
│                      USYC Lifecycle                           │
│                                                              │
│                  ┌─────────────────┐                         │
│                  │  Hashnote USYC  │                         │
│                  │  NAV: $1.04     │                         │
│                  │  APY: ~5.1%     │                         │
│                  │  Backed by:     │                         │
│                  │  US T-bills     │                         │
│                  └────────┬────────┘                         │
│                           │                                  │
│    Deploy                 │              Redeem               │
│    ───────▶               │              ◀───────            │
│                           │                                  │
│  50,000 USDC      48,077 USYC tokens     50,400 USDC        │
│  (subscription)   (yield accrues daily)   (principal+yield)  │
│                                                              │
│  Redemption options:                                         │
│  ┌──────────┐    ┌────────────┐                              │
│  │  Portal  │    │ Contracts  │                              │
│  │  (T+1)   │    │ (Instant)  │                              │
│  │  No fee  │    │  Fee: ~5bp │                              │
│  └──────────┘    └────────────┘                              │
│                                                              │
│  Cross-chain support:                                        │
│  Redeem from any CCTP-supported chain                        │
└──────────────────────────────────────────────────────────────┘
```

**Why it matters**: DeFi yields fluctuate. USYC offers a stable, regulated yield floor backed by the US government — ideal for risk-averse treasury allocations.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Zustand, Framer Motion |
| Backend | Node.js, Express, TypeScript, ethers.js v6 |
| Database | SQLite (WAL mode) via better-sqlite3 |
| Contracts | Solidity 0.8.20, Hardhat, OpenZeppelin |
| Chain | ARC Testnet (Circle L1, chain 5042002) |
| Wallets | Circle Programmable Wallets (server-side custodial) |
| FX | Circle StableFX API |
| RWA | Hashnote USYC (tokenized T-bills) |
| Bridging | Circle CCTP (Cross-Chain Transfer Protocol) |
| Scheduling | node-cron with SQLite persistence |

---

## Project Structure

```
sphere/
├── contracts/                    # Solidity smart contracts (Hardhat)
│   ├── contracts/
│   │   ├── MockERC20.sol         # Testnet ERC20 tokens
│   │   ├── SphereSwapRouter.sol  # Constant-product AMM
│   │   ├── SphereDistributor.sol # Batch payroll distribution
│   │   ├── SphereYieldVault.sol  # DeFi yield vault
│   │   └── SphereAgentWallet.sol # Budget escrow for AI agents
│   ├── scripts/
│   │   └── deploy.ts             # Deploy + seed liquidity
│   └── deployments/
│       └── arc-testnet.json      # Deployed contract addresses
│
├── server/                       # Express backend
│   └── src/
│       ├── index.ts              # Server entry, route mounting
│       ├── config.ts             # Chain config, token addresses
│       ├── db/
│       │   └── schema.sql        # wallets, transactions, jobs, sessions
│       ├── routes/
│       │   ├── wallet.ts         # Create, balance, deposit
│       │   ├── swap.ts           # AMM quotes + StableFX
│       │   ├── yield.ts          # DeFi vault + USYC
│       │   ├── distribute.ts     # Batch send + scheduling
│       │   ├── agent.ts          # AI agent sessions
│       │   └── bridge.ts         # CCTP transfers
│       └── services/
│           ├── circle.ts         # Programmable Wallets + StableFX
│           ├── contracts.ts      # ethers.js contract interactions
│           ├── usyc.ts           # Hashnote USYC integration
│           ├── bridge.ts         # Cross-chain CCTP
│           ├── openclaw.ts       # AI agent execution
│           └── scheduler.ts      # Cron job management
│
├── src/                          # React frontend
│   ├── App.tsx                   # Layout, header stats, canvas
│   ├── types/index.ts            # All TypeScript interfaces
│   ├── store/graphStore.ts       # Zustand state (nodes, connections, history)
│   ├── components/
│   │   ├── SphereCanvas.tsx      # CSS 3D sphere renderer
│   │   ├── ConnectionLayer.tsx   # SVG Bezier connections + pulse animation
│   │   ├── SphereNode.tsx        # Node wrapper, ports, context menu
│   │   ├── NodePalette.tsx       # Left sidebar node picker
│   │   ├── ActivityPanel.tsx     # Right sidebar (history + upcoming)
│   │   └── panels/
│   │       └── NodePanel.tsx     # Node configuration + execution panel
│   └── services/
│       ├── api.ts                # Axios instance
│       ├── wallet.ts             # Wallet API calls
│       ├── swap.ts               # Swap + StableFX API calls
│       ├── yield.ts              # Yield + USYC API calls
│       ├── distribute.ts         # Distribution API calls
│       ├── agent.ts              # Agent API calls
│       └── bridge.ts             # Bridge API calls
│
├── vite.config.ts                # Vite + /api proxy to :3001
└── package.json
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### 1. Install Dependencies

```bash
# Frontend
npm install

# Backend
cd server && npm install

# Contracts
cd contracts && npm install
```

### 2. Environment Setup

```bash
cp .env.example .env
```

Required variables:

```env
# Chain
ARC_RPC_URL=https://rpc.testnet.arc.network
ARC_CHAIN_ID=5042002

# Deploy (only needed for contract deployment)
DEPLOYER_PRIVATE_KEY=

# Circle (optional — falls back to mock)
CIRCLE_API_KEY=
STABLEFX_TEST_API_KEY=

# Server
PORT=3001
DATABASE_PATH=./server/data/sphere.db
```

### 3. Deploy Contracts (optional — uses existing testnet deployment)

```bash
cd contracts
npx hardhat run scripts/deploy.ts --network arc
```

This deploys all contracts, seeds liquidity pools (USDC/WETH, USDC/USDT, USDC/DAI), and writes addresses to `deployments/arc-testnet.json`.

### 4. Run

```bash
# Terminal 1 — Backend
cd server && npm run dev

# Terminal 2 — Frontend
npm run dev
```

Frontend runs on `http://localhost:5173` with API calls proxied to `http://localhost:3001`.

---

## API Reference

### Wallet
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/wallet/create` | Create a Circle Programmable Wallet |
| GET | `/api/wallet/:address/balance` | Get onchain + Circle balances |
| POST | `/api/wallet/deposit` | Mint testnet tokens to wallet |
| GET | `/api/wallet/list` | List all created wallets |

### Swap
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/swap/quote` | Get AMM swap quote (rate, impact, fee) |
| POST | `/api/swap/execute` | Execute onchain swap |
| POST | `/api/swap/stablefx/quote` | Get StableFX FX rate quote |
| POST | `/api/swap/stablefx/execute` | Execute StableFX trade |

### Yield
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/yield/defi/deposit` | Deposit into yield vault |
| POST | `/api/yield/defi/harvest` | Harvest accrued DeFi yield |
| GET | `/api/yield/defi/accrued/:address` | View accrued yield |
| GET | `/api/yield/usyc/price` | Get current USYC NAV + APY |
| POST | `/api/yield/usyc/deploy` | Subscribe USDC into USYC |
| POST | `/api/yield/usyc/redeem` | Redeem USYC back to USDC |

### Distribution
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/distribute/execute` | Batch distribute tokens |
| POST | `/api/distribute/schedule` | Schedule recurring distribution |
| GET | `/api/distribute/scheduled` | List scheduled jobs |
| DELETE | `/api/distribute/scheduled/:id` | Cancel a scheduled job |

### Bridge
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/bridge/chains` | List CCTP-supported chains |
| POST | `/api/bridge/quote` | Get bridge fee + time estimate |
| POST | `/api/bridge/execute` | Execute cross-chain USDC transfer |
| GET | `/api/bridge/status/:messageHash` | Track bridge attestation |

---

## Design Decisions

**CSS spheres over Three.js** — Pure `radial-gradient` spheres keep the bundle small and rendering fast. No WebGL context, no canvas — just CSS with a highlight offset and ground shadow for depth.

**Zustand over Redux** — The node graph mutates frequently (drag, connect, select). Zustand's minimal API and direct mutations are ideal for this.

**SQLite over Postgres** — Single-server deployment with no external DB dependency. WAL mode handles concurrent reads from the scheduler and API routes. Cron jobs and sessions persist and restore on restart.

**Dual-mode nodes** — Rather than creating separate node types for AMM vs FX or DeFi vs RWA, each node has a mode toggle. This keeps the palette simple (4 nodes) while exposing the full capability surface.

**Server-side wallets** — Circle Programmable Wallets are custodial by design, enabling the server to execute transactions (scheduled jobs, agent operations) without requiring user signatures for every action.

---

## License

MIT
