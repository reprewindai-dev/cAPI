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
import { createClient } from "redis";

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

/** Process-local fallback for local development without a configured Redis URL. */
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

/**
 * Redis-backed catalog. Redis key expiry is derived from each registration's
 * expires_at so the persistence layer follows the same TTL contract as the
 * in-memory registry.
 */
export class RedisRegistryStore implements RegistryStore {
  private readonly client = createClient({ url: this.url });
  private connectPromise: Promise<void> | null = null;
  private readonly indexKey = "covenant:registry:services";

  constructor(private readonly url: string) {
    this.client.on("error", (error) => {
      console.error("[registry] Redis error", error instanceof Error ? error.message : "unknown error");
    });
  }

  private async connected(): Promise<void> {
    if (this.client.isOpen) return;
    if (!this.connectPromise) {
      this.connectPromise = this.client.connect().then(() => undefined).finally(() => {
        this.connectPromise = null;
      });
    }
    await this.connectPromise;
  }

  private key(serviceName: string): string {
    return `covenant:registry:service:${encodeURIComponent(serviceName)}`;
  }

  async put(registration: ServiceRegistration): Promise<void> {
    await this.connected();
    const ttlMs = Date.parse(registration.expires_at) - Date.now();
    if (ttlMs <= 0) {
      await this.delete(registration.service_name);
      return;
    }
    await this.client
      .multi()
      .set(this.key(registration.service_name), JSON.stringify(registration), { PX: ttlMs })
      .sAdd(this.indexKey, registration.service_name)
      .exec();
  }

  async get(serviceName: string): Promise<ServiceRegistration | undefined> {
    await this.connected();
    const raw = await this.client.get(this.key(serviceName));
    if (!raw) {
      await this.client.sRem(this.indexKey, serviceName);
      return undefined;
    }
    try {
      return JSON.parse(raw) as ServiceRegistration;
    } catch {
      console.warn(`[registry] Ignoring malformed Redis record for ${serviceName}`);
      await this.client.sRem(this.indexKey, serviceName);
      return undefined;
    }
  }

  async list(): Promise<ServiceRegistration[]> {
    await this.connected();
    const names = await this.client.sMembers(this.indexKey);
    const records = await Promise.all(names.map((name) => this.get(name)));
    return records.filter((record): record is ServiceRegistration => record !== undefined);
  }

  async delete(serviceName: string): Promise<void> {
    await this.connected();
    await this.client.multi().del(this.key(serviceName)).sRem(this.indexKey, serviceName).exec();
  }
}

/**
 * Redis is the durable production store when configured. Without REDIS_URL,
 * retain the local in-memory behavior explicitly and log the degraded mode.
 */
export function createRegistryStore(): RegistryStore {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (redisUrl) return new RedisRegistryStore(redisUrl);
  
  if (process.env.NODE_ENV === 'production') {
    throw new Error("CRITICAL STARTUP ERROR: REDIS_URL is not configured. REDIS_URL must be set to the shared Redis container: redis://v8vf3lw73fx9lw9xmbq1tvo5:6379");
  }
  
  console.error("CRITICAL STARTUP ERROR: REDIS_URL is not configured.");
  console.error("The service registry is ephemeral without Redis. All registered services will be LOST on every restart.");
  console.error("REDIS_URL must be set to the shared Redis container: redis://v8vf3lw73fx9lw9xmbq1tvo5:6379");
  console.warn("[registry] Falling back to in-memory registry store");
  return new InMemoryRegistryStore();
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
    private readonly store: RegistryStore = createRegistryStore(),
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

  async delete(serviceName: string): Promise<void> {
    await this.store.delete(serviceName);
  }
}
