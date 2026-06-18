/**
 * Covenant Engine — process-wide singleton.
 *
 * Wires the runtime + layers, holds the agent keystore (so the console can sign
 * calls on behalf of demo agents using real Ed25519 keys), seeds a realistic
 * fleet, and warms the ledger with historical traffic.
 */

import { randomUUID } from "crypto";
import {
  canonicalRequestMessage,
  generateKeyPair,
  signMessage,
} from "./crypto";
import { CovenantRuntime, type ProcessOptions } from "./runtime";
import { seedFleet } from "./seed";
import type { CovenantRequest, CovenantResponse } from "./types";

export interface SignedCallInput {
  agent_id: string;
  capability_id: string;
  action: string;
  input: Record<string, unknown>;
  context?: CovenantRequest["context"];
  approvals?: string[];
  bypass?: ProcessOptions["bypass"];
  /** Force an invalid signature to demonstrate Phase 1 rejection. */
  tamper?: boolean;
}

export class CovenantEngine {
  readonly runtime = new CovenantRuntime();
  /** agent_id -> private key (base64 PKCS8). Server-side only. */
  private keystore = new Map<string, string>();

  constructor() {
    seedFleet(this);
  }

  registerKey(agent_id: string, privateKeyB64: string): void {
    this.keystore.set(agent_id, privateKeyB64);
  }

  newKeyPair() {
    return generateKeyPair();
  }

  /**
   * Build a canonical request, sign it with the agent's private key, and run it
   * through the full pipeline. This is exactly what an SDK client would do.
   */
  signAndProcess(call: SignedCallInput): CovenantResponse {
    const privateKey = this.keystore.get(call.agent_id);
    const timestamp = new Date().toISOString();
    const connection_id = randomUUID();
    const base = {
      connection_id,
      agent_id: call.agent_id,
      capability_id: call.capability_id,
      action: call.action,
      input: call.input,
      timestamp,
    };
    let signature = "invalid-signature";
    if (privateKey && !call.tamper) {
      signature = signMessage(canonicalRequestMessage(base), privateKey);
    }
    const request: CovenantRequest = {
      ...base,
      agent_signature: signature,
      context: call.context ?? { trace_id: randomUUID() },
    };
    return this.runtime.process(request, {
      approvals: call.approvals,
      bypass: call.bypass,
    });
  }
}

// Persist across hot reloads / route invocations within the same process.
const globalForCovenant = globalThis as unknown as { __covenant?: CovenantEngine };

export function getEngine(): CovenantEngine {
  if (!globalForCovenant.__covenant) {
    globalForCovenant.__covenant = new CovenantEngine();
  }
  return globalForCovenant.__covenant;
}
