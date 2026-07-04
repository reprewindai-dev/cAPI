import { NextResponse } from "next/server";

const PAYMENT_WALLET = "0x3a74772e925b54F7dAD7FD95c9Ba30825033f970";
const ID_WALLET = "0x3a74772e925b54F7dAD7FD95c9Ba30825033f970";
const USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CHAIN_ID = "eip155:8453";
const BASE_APP_ID = "6a20f24cc341f72c2f573eb5";

const PRICES: Record<string, string> = {
  "/api/compose": "0.015",
  "/api/request": "0.010",
  "/api/audit": "0.005",
  "/api/pgl": "0.005",
  "/api/replay": "0.005",
  "/api/state": "0.003",
  "/api/discover": "0.003",
  "/api/budget": "0.003",
};

/** GET /api/x402 — x402 config and pricing for agents and wallets */
export async function GET() {
  return NextResponse.json({
    x402_version: 2,
    provider: "Veklom cAPI — Covenant Execution Gateway",
    chain: CHAIN_ID,
    payment_wallet: PAYMENT_WALLET,
    identity_wallet: ID_WALLET,
    usdc_contract: USDC_CONTRACT,
    base_app_id: BASE_APP_ID,
    prices: PRICES,
    spec: "https://x402.org",
    discovery: "/.well-known/x402.json",
  });
}
