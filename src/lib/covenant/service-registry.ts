/**
 * Service Registry — the self-registration primitive.
 *
 * The unification story ("one call that discovers, authorizes, executes,
 * proves, and learns") starts with discovery: downstream Veklom services
 * (lockerphycer, BYOS, CAPPO, gnomledger, …) announce themselves and the
 * capabilities they expose by POSTing to `/api/v1/registry/register`. cAPI
 * keeps a live, attributed catalog of who is connected and what they can do.
 *
 * Provenance is explicit and honest: a self-registered capability is
 * *self-attested* (Tier1), not cryptographically proven. Capabilities that
 * carry an executable endpoint (mcp:// or http(s)://) are also mirrored into
 * the runtime capability graph so they become discoverable/executable through
 * the 9-phase pipeline; bare capability names are recorded as declarations
 * only and are never presented as executable.
 *
 * The store is pluggable and async so a durable backend (Redis) can replace
 * the in-memory default without touching callers.
 */

import type { CapabilityCategory, CapabilityIdentity, Severity } from "./types";

export type CapabilityMethodPrefix = "mcp" | "http" | "https";

export interface RegisteredCapability {
  name: string;
  description?: string;
  /** mcp://service/tool | http(s)://… — when present the capability is executable. */
  endpoint?: string;
  input_schema?: Record<string, unknown>;
  category?: CapabilityCategory;
  risk_level?: Severity;
  requires_approval?: boolean;
}

export interface ServiceRegistrationInput {
  service_name: string;
  base_url?: string;
  public_key?: string;
  telemetry_supported?: boolean;
  capabilities?: RegisteredCapability[];
  metadata?: Record<string, unknown>;
}

export interface ServiceRegistration {
  service_name: string;
  base_url?: string;
  public_key?: string;
  telemetry_supported: boolean;
  capabilities: RegisteredCapability[];
  metadata: Record<string, unknown>;
  /** Whether the registration presented a token that matched CAPI_REGISTRY_TOKEN. */
  authenticated: boolean;
  registered_at: string;
  last_seen: string;
  expires_at: string;
}

export interface RegistryStore {
  put(registration: ServiceRegistration): Promise<void>;
  get(serviceName: string): Promise<ServiceRegistration | undefined>;
  list(): Promise<ServiceRegistration[]>;
  delete(serviceName: string): Promise<void>;
}

/** Process-local store. Durable enough for a single runtime; replaced by Redis in a later phase. */
export class InMemoryRegistryStore implements RegistryStore {
  private services = new Map<string, ServiceRegistration>();

  async put(registration: ServiceRegistration): Promise<void> {
    this.services.set(registration.service_name, registration);
  }
  async get(serviceName: string): Promise<ServiceRegistration | undefined> {
    return this.services.get(serviceName);
  }
  async list(): Promise<ServiceRegistration[]> {
    return [...this.services.values()];
  }
  async delete(serviceName: string): Promise<void> {
    this.services.delete(serviceName);
  }
}

function isExecutableEndpoint(endpoint: string | undefined): endpoint is string {
  if (!endpoint) return false;
  return /^(mcp|https?):\/\//.test(endpoint);
}

/**
 * Result of registering a service: the stored record plus the subset of its
 * capabilities that were mirrored into the runtime capability graph because
 * they carry an executable endpoint.
 */
export interface RegisterResult {
  registration: ServiceRegistration;
  executableCapabilities: CapabilityIdentity[];
  declaredOnly: string[];
}

export class ServiceRegistry {
  private readonly ttlMs: number;

  constructor(
    private readonly store: RegistryStore = new InMemoryRegistryStore(),
    ttlMs = Number(process.env.CAPI_REGISTRY_TTL_MS ?? 300_000),
  ) {
    this.ttlMs = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : 300_000;
  }

  async register(input: ServiceRegistrationInput, authenticated: boolean): Promise<RegisterResult> {
    const now = new Date();
    const existing = await this.store.get(input.service_name);
    const capabilities = input.capabilities ?? [];

    const registration: ServiceRegistration = {
      service_name: input.service_name,
      base_url: input.base_url,
      public_key: input.public_key,
      telemetry_supported: Boolean(input.telemetry_supported),
      capabilities,
      metadata: input.metadata ?? {},
      authenticated,
      registered_at: existing?.registered_at ?? now.toISOString(),
      last_seen: now.toISOString(),
      expires_at: new Date(now.getTime() + this.ttlMs).toISOString(),
    };
    await this.store.put(registration);

    const executableCapabilities: CapabilityIdentity[] = [];
    const declaredOnly: string[] = [];
    for (const cap of capabilities) {
      if (isExecutableEndpoint(cap.endpoint)) {
        executableCapabilities.push(this.toCapabilityIdentity(registration, cap, cap.endpoint));
      } else {
        declaredOnly.push(cap.name);
      }
    }

    return { registration, executableCapabilities, declaredOnly };
  }

  private toCapabilityIdentity(
    registration: ServiceRegistration,
    cap: RegisteredCapability,
    endpoint: string,
  ): CapabilityIdentity {
    return {
      capability_id: `svc::${registration.service_name}::${cap.name}`,
      capability_name: cap.name,
      description: cap.description ?? `Self-registered capability from ${registration.service_name}`,
      provider_id: registration.service_name,
      endpoint,
      input_schema: cap.input_schema ?? { type: "object" },
      output_schema: { type: "object" },
      public_key: registration.public_key ?? "",
      created_at: registration.registered_at,
      version: "1.0",
      // Provenance is explicit: self-attested, not cryptographically proven.
      identity_proof: `self-registered:${registration.service_name}`,
      metadata: {
        category: cap.category ?? "service",
        requires_approval: cap.requires_approval ?? false,
        cost: "credits",
        rate_limit: 60,
        tags: ["self-registered", registration.service_name],
        risk_level: cap.risk_level,
        audit_level: "standard",
        provider: registration.service_name,
        verification_tier: "Tier1",
      },
    };
  }

  async heartbeat(serviceName: string): Promise<ServiceRegistration | undefined> {
    const existing = await this.store.get(serviceName);
    if (!existing) return undefined;
    const now = new Date();
    const updated: ServiceRegistration = {
      ...existing,
      last_seen: now.toISOString(),
      expires_at: new Date(now.getTime() + this.ttlMs).toISOString(),
    };
    await this.store.put(updated);
    return updated;
  }

  async get(serviceName: string): Promise<ServiceRegistration | undefined> {
    return this.store.get(serviceName);
  }

  async list(): Promise<ServiceRegistration[]> {
    return this.store.list();
  }

  /** True when a service's registration has not been refreshed within its TTL. */
  isStale(registration: ServiceRegistration, at: Date = new Date()): boolean {
    return Date.parse(registration.expires_at) < at.getTime();
  }

  async count(): Promise<number> {
    return (await this.store.list()).length;
  }
}
