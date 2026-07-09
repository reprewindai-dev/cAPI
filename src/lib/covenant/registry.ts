import type {
  AgentIdentity,
  BehavioralBaseline,
  CapabilityIdentity,
  CostModel,
  Policy,
  RegistryProofState,
} from "./types";

export interface CovenantRegistryDocument {
  agents?: Array<AgentIdentity & { private_key_b64?: string }>;
  capabilities?: CapabilityIdentity[];
  policies?: Policy[];
  cost_models?: CostModel[];
  baselines?: BehavioralBaseline[];
  source?: string;
}

export interface RegistryLoadResult {
  proof: RegistryProofState;
  document?: CovenantRegistryDocument;
  skipped: string[];
}

function now(): string {
  return new Date().toISOString();
}

function authHeaderValue(): string | null {
  const raw = process.env.COVENANT_REGISTRY_API_KEY || process.env.BYOS_INTERNAL_API_KEY || "";
  if (!raw) return null;
  return raw.startsWith("Bearer ") ? raw : `Bearer ${raw}`;
}

function readRegistryJson(): RegistryLoadResult | null {
  const raw = process.env.COVENANT_REGISTRY_JSON;
  if (!raw) return null;
  try {
    const document = JSON.parse(raw) as CovenantRegistryDocument;
    return {
      proof: {
        state: "ready",
        source: "configured-registry",
        detail: "Loaded registry from COVENANT_REGISTRY_JSON",
        checked_at: now(),
      },
      document,
      skipped: [],
    };
  } catch (err) {
    return {
      proof: {
        state: "degraded",
        source: "configured-registry",
        detail: `COVENANT_REGISTRY_JSON parse failed: ${err instanceof Error ? err.message : String(err)}`,
        checked_at: now(),
      },
      skipped: [],
    };
  }
}

function mapByosAgent(item: Record<string, unknown>, skipped: string[]): (AgentIdentity & { private_key_b64?: string }) | null {
  const id = String(item.agent_id || item.id || item.agent_number || "");
  const publicKey = String(item.public_key || item.agent_public_key || "");
  if (!id) {
    skipped.push("BYOS registry item missing agent_id");
    return null;
  }
  if (!publicKey) {
    skipped.push(`BYOS agent ${id} missing public_key; cannot verify signed Covenant requests`);
    return null;
  }
  return {
    agent_id: id,
    agent_name: String(item.name || item.codename || id),
    owner_id: String(item.account_id || item.owner_id || "byos"),
    public_key: publicKey,
    capabilities_manifest: String(item.capabilities_manifest || `byos://agents/${id}/capabilities`),
    created_at: String(item.created_at || now()),
    identity_proof: String(item.identity_proof || item.event_hash || `byos:${id}`),
    metadata: {
      version: String(item.version || "1.0.0"),
      framework: String(item.framework || "Veklom"),
      inference_provider: "other",
      tier: "service",
    },
  };
}

function normalizeRemoteRegistry(raw: unknown, source: "byos-registry" | "configured-registry"): RegistryLoadResult {
  const skipped: string[] = [];
  const body = raw as Record<string, unknown>;
  const items = Array.isArray(body.items) ? body.items as Array<Record<string, unknown>> : [];
  const directAgents = Array.isArray(body.agents) ? body.agents as AgentIdentity[] : [];
  const agents = directAgents.length
    ? directAgents
    : items.map((item) => mapByosAgent(item, skipped)).filter((agent): agent is AgentIdentity => Boolean(agent));

  return {
    proof: {
      state: agents.length > 0 ? "ready" : "needs_proof",
      source,
      detail: agents.length > 0
        ? `Loaded ${agents.length} verifiable agent identity record(s)`
        : "Registry responded but did not include verifiable agent public keys",
      checked_at: now(),
    },
    document: {
      agents,
      capabilities: Array.isArray(body.capabilities) ? body.capabilities as CapabilityIdentity[] : [],
      policies: Array.isArray(body.policies) ? body.policies as Policy[] : [],
      cost_models: Array.isArray(body.cost_models) ? body.cost_models as CostModel[] : [],
      baselines: Array.isArray(body.baselines) ? body.baselines as BehavioralBaseline[] : [],
      source: String(body.source || source),
    },
    skipped,
  };
}

export async function loadConfiguredRegistry(): Promise<RegistryLoadResult> {
  const fromJson = readRegistryJson();
  if (fromJson) return fromJson;

  const registryUrl = process.env.COVENANT_REGISTRY_URL || "";
  if (!registryUrl) {
    return {
      proof: {
        state: "needs_proof",
        source: "none",
        detail: "No COVENANT_REGISTRY_JSON or COVENANT_REGISTRY_URL configured",
        checked_at: now(),
      },
      skipped: [],
    };
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  const auth = authHeaderValue();
  if (auth) headers.Authorization = auth;

  try {
    const res = await fetch(registryUrl, { headers, cache: "no-store" });
    if (!res.ok) {
      return {
        proof: {
          state: "degraded",
          source: registryUrl.includes("api.veklom.com") ? "byos-registry" : "configured-registry",
          detail: `Registry fetch failed with HTTP ${res.status}`,
          checked_at: now(),
        },
        skipped: [],
      };
    }
    return normalizeRemoteRegistry(
      await res.json(),
      registryUrl.includes("api.veklom.com") ? "byos-registry" : "configured-registry",
    );
  } catch (err) {
    return {
      proof: {
        state: "degraded",
        source: registryUrl.includes("api.veklom.com") ? "byos-registry" : "configured-registry",
        detail: `Registry fetch failed: ${err instanceof Error ? err.message : String(err)}`,
        checked_at: now(),
      },
      skipped: [],
    };
  }
}

