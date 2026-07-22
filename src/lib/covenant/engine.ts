/**
 * Covenant Engine — process-wide singleton.
 *
 * Wires the runtime + layers and holds any server-managed agent keystore.
 * Production does not create demo agents or warm evidence automatically; state
 * must come from a configured registry or signed runtime requests.
 */

import { randomUUID } from "crypto";
import {
  canonicalRequestMessage,
  generateKeyPair,
  signMessage,
} from "./crypto";
import { CovenantRuntime, type ProcessOptions } from "./runtime";
import { loadConfiguredRegistry, type CovenantRegistryDocument } from "./registry";
import {
  ServiceRegistry,
  type RegisterResult,
  type ServiceRegistration,
  type ServiceRegistrationInput,
} from "./service-registry";
import { seedFleet } from "./seed";
import type { CovenantRequest, CovenantResponse, RegistryProofState } from "./types";

export interface SignedCallInput {
  agent_id: string;
  capability_id: string;
  action: string;
  input: Record<string, unknown>;
  context?: CovenantRequest["context"];
  approvals?: string[];
  bypass?: ProcessOptions["bypass"];
  /** Force an invalid signature for explicit negative-path tests only. */
  tamper?: boolean;
}

export class CovenantEngine {
  readonly runtime = new CovenantRuntime();
  /** Live catalog of self-registered downstream services. */
  readonly services = new ServiceRegistry();
  /** Synchronous mirror of the service registry so snapshots stay non-blocking. */
  private serviceCache: ServiceRegistration[] = [];
  /** agent_id -> private key (base64 PKCS8). Server-side only. */
  private keystore = new Map<string, string>();
  private registryProof: RegistryProofState = {
    state: "needs_proof",
    source: "none",
    detail: "Runtime has not loaded a registry source yet",
    checked_at: new Date().toISOString(),
  };
  private registrySyncAt = 0;
  private registrySyncInFlight: Promise<void> | null = null;
  private registrySkipped: string[] = [];


  constructor() {
    if (process.env.COVENANT_ENABLE_DEMO_SEED === "true") {
      seedFleet(this);
      this.registryProof = {
        state: "degraded",
        source: "demo-seed",
        detail: "COVENANT_ENABLE_DEMO_SEED=true loaded non-production demo seed data",
        checked_at: new Date().toISOString(),
      };
    }
  }

  registerKey(agent_id: string, privateKeyB64: string): void {
    this.keystore.set(agent_id, privateKeyB64);
  }

  hasSigningKey(agent_id: string): boolean {
    return this.keystore.has(agent_id);
  }

  newKeyPair() {
    return generateKeyPair();
  }

  /**
   * Build a canonical request, sign it with the agent's private key, and run it
   * through the full pipeline. This is exactly what an SDK client would do.
   */
  async signAndProcess(call: SignedCallInput): Promise<CovenantResponse> {
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
    const response = await this.runtime.process(request, {
      approvals: call.approvals,
      bypass: call.bypass,
    });

    return response;
  }

  registryStatus(): RegistryProofState & { skipped: string[] } {
    return { ...this.registryProof, skipped: this.registrySkipped };
  }

  /**
   * Register a downstream service and mirror its executable capabilities into
   * the runtime capability graph. Self-registered capabilities are marked
   * self-attested (Tier1) — a declaration, not a cryptographic proof.
   */
  async registerService(
    input: ServiceRegistrationInput,
    authenticated: boolean,
  ): Promise<RegisterResult> {
    const result = await this.services.register(input, authenticated);
    for (const cap of result.executableCapabilities) {
      this.runtime.registerCapability(cap);
    }
    this.serviceCache = await this.services.list();
    this.registryProof = {
      state: "ready",
      source: "self-registration",
      detail:
        `${result.registration.service_name} registered ` +
        `${result.executableCapabilities.length} executable + ` +
        `${result.declaredOnly.length} declared capability(ies)`,
      checked_at: new Date().toISOString(),
    };
    return result;
  }

  async heartbeatService(serviceName: string): Promise<ServiceRegistration | undefined> {
    const updated = await this.services.heartbeat(serviceName);
    if (updated) this.serviceCache = await this.services.list();
    return updated;
  }

  listServices(): ServiceRegistration[] {
    return this.serviceCache;
  }

  registerDocument(document: CovenantRegistryDocument): void {
    document.agents?.forEach((agent) => {
      const { private_key_b64: privateKeyB64, ...identity } = agent;
      this.runtime.registerAgent(identity);
      if (privateKeyB64) this.registerKey(identity.agent_id, privateKeyB64);
    });
    document.capabilities?.forEach((capability) => this.runtime.registerCapability(capability));
    document.policies?.forEach((policy) => this.runtime.registerPolicy(policy));
    document.cost_models?.forEach((model) => this.runtime.intelligence.registerCostModel(model));
    document.baselines?.forEach((baseline) => this.runtime.safety.setBaseline(baseline));
  }

  async syncRegistry(force = false): Promise<void> {
    const ttlMs = Number(process.env.COVENANT_REGISTRY_TTL_MS ?? 30_000);
    if (!force && Date.now() - this.registrySyncAt < ttlMs) return;
    if (this.registrySyncInFlight) return this.registrySyncInFlight;

    this.registrySyncInFlight = (async () => {
      const result = await loadConfiguredRegistry();
      // An unconfigured pull-registry must not erase live self-registration state.
      const nothingConfigured = result.proof.source === "none";
      if (!(nothingConfigured && this.serviceCache.length > 0)) {
        this.registryProof = result.proof;
        this.registrySkipped = result.skipped;
      }
      this.registrySyncAt = Date.now();
      if (result.document) this.registerDocument(result.document);
    })().finally(() => {
      this.registrySyncInFlight = null;
    });
    return this.registrySyncInFlight;
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
