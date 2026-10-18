/**
 * Live view of the Veklom network as cAPI can observe it: CAPPO's capability
 * catalog and VNP metrics, the services registered with this node, dependency
 * health and the registry sync status. Every field is fetched or probed, never
 * seeded, and each source reports its own state so the UI can say exactly
 * what is live and what is not. Internal hostnames are never included.
 */

import { getEngine } from "@/lib/covenant/engine";
import { TOOLS } from "@/lib/mcp/veklom-mcp";
import { probeDependencies, type DependencyState } from "./probe";

const FETCH_TIMEOUT_MS = 3_000;
const CACHE_TTL_MS = 10_000;

export type SourceState = "live" | "unavailable" | "unconfigured";

export interface SourceResult<T> {
  state: SourceState;
  data?: T;
  error?: string;
}

export interface CapabilityPackageSummary {
  id: string;
  title: string;
  family: string | null;
  purpose: string | null;
  reads: string[];
  writes: string[];
  blocked: string[];
  outputs: string[];
  target_ref: string | null;
  requires_start_claim: boolean;
  policy_defaults: Record<string, unknown>;
}

export interface VnpSummary {
  proof_state: string | null;
  proof_signal: string | null;
  methodology: string | null;
  active_nodes: number | null;
  expected_nodes: number | null;
  probes_recorded: number | null;
  active_validators: number | null;
  avg_composite_score: number | null;
  measured_at: string | null;
}

export interface BeaconKeySummary {
  issuer: string | null;
  keys: Array<{ kid: string; algorithm: string | null; curve: string | null }>;
}

export interface ServiceSummary {
  service_name: string;
  base_url: string | null;
  capabilities: string[];
  authenticated: boolean;
  telemetry_supported: boolean;
  registered_at: string | null;
  last_seen: string | null;
  stale: boolean;
}

export interface NetworkSnapshot {
  checked_at: string;
  dependencies: Record<string, { state: DependencyState; latency_ms: number | null }>;
  packages: SourceResult<CapabilityPackageSummary[]>;
  vnp: SourceResult<VnpSummary>;
  beacon_keys: SourceResult<BeaconKeySummary>;
  services: SourceResult<ServiceSummary[]>;
  registry: { state: string; source: string; detail: string; checked_at: string } | null;
  mcp_tools: Array<{ name: string; title: string; public: boolean }>;
}

let cached: { at: number; value: NetworkSnapshot } | null = null;
let inflight: Promise<NetworkSnapshot> | null = null;

export async function getNetworkSnapshot(): Promise<NetworkSnapshot> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  if (!inflight) {
    inflight = buildNetworkSnapshot()
      .then((value) => {
        cached = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function resetNetworkSnapshotCache(): void {
  cached = null;
  inflight = null;
}

export async function buildNetworkSnapshot(): Promise<NetworkSnapshot> {
  const cappo = process.env.CAPPO_BACKEND_URL?.trim().replace(/\/+$/, "");
  const [dependencies, packages, vnp, beaconKeys, services] = await Promise.all([
    probeDependencies(),
    cappo ? fetchJson(`${cappo}/v1/capability/packages`).then((r) => mapSource(r, toPackages)) : unconfigured<CapabilityPackageSummary[]>(),
    cappo ? fetchJson(`${cappo}/v1/vnp/metrics`).then((r) => mapSource(r, toVnp)) : unconfigured<VnpSummary>(),
    cappo ? fetchJson(`${cappo}/.well-known/capability-beacon-keys`).then((r) => mapSource(r, toBeaconKeys)) : unconfigured<BeaconKeySummary>(),
    readServices(),
    syncRegistry(),
  ]);

  return {
    checked_at: new Date().toISOString(),
    dependencies: Object.fromEntries(
      Object.entries(dependencies).map(([name, dep]) => [name, { state: dep.state, latency_ms: dep.latency_ms }]),
    ),
    packages,
    vnp,
    beacon_keys: beaconKeys,
    services,
    registry: readRegistryStatus(),
    mcp_tools: TOOLS.map((tool) => ({ name: tool.name, title: tool.title, public: !tool.requiresCredential })),
  };
}

type FetchOutcome = { ok: true; body: unknown } | { ok: false; error: string };

async function fetchJson(url: string): Promise<FetchOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { accept: "application/json" }, signal: controller.signal, cache: "no-store" });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    return { ok: true, body: await response.json() };
  } catch (error) {
    return { ok: false, error: error instanceof Error && error.name === "AbortError" ? "timeout" : "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

function mapSource<T>(outcome: FetchOutcome, map: (body: unknown) => T | undefined): SourceResult<T> {
  if (!outcome.ok) return { state: "unavailable", error: outcome.error };
  const data = map(outcome.body);
  return data === undefined ? { state: "unavailable", error: "unexpected response shape" } : { state: "live", data };
}

async function unconfigured<T>(): Promise<SourceResult<T>> {
  return { state: "unconfigured" };
}

function obj(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function toPackages(body: unknown): CapabilityPackageSummary[] | undefined {
  if (!Array.isArray(body)) return undefined;
  return body.flatMap((item) => {
    const pkg = obj(item);
    const id = text(pkg?.id);
    if (!pkg || !id) return [];
    return [{
      id,
      title: text(pkg.title) ?? id,
      family: text(pkg.family),
      purpose: text(pkg.purpose),
      reads: strings(pkg.reads),
      writes: strings(pkg.writes),
      blocked: strings(pkg.blocked),
      outputs: strings(pkg.outputs),
      target_ref: text(pkg.target_ref),
      requires_start_claim: pkg.requires_start_claim === true,
      policy_defaults: obj(pkg.policy_defaults) ?? {},
    }];
  });
}

export function toVnp(body: unknown): VnpSummary | undefined {
  const vnp = obj(body);
  if (!vnp) return undefined;
  return {
    proof_state: text(vnp.proofState),
    proof_signal: text(vnp.proofSignal),
    methodology: text(vnp.protocolVersion),
    active_nodes: num(vnp.activeNodesCount),
    expected_nodes: num(vnp.expectedNodesCount),
    probes_recorded: num(vnp.total_probes_recorded),
    active_validators: num(vnp.active_validators),
    avg_composite_score: num(vnp.avg_composite_score),
    measured_at: text(vnp.timestamp),
  };
}

export function toBeaconKeys(body: unknown): BeaconKeySummary | undefined {
  const doc = obj(body);
  if (!doc || !Array.isArray(doc.keys)) return undefined;
  return {
    issuer: text(doc.issuer),
    keys: doc.keys.flatMap((k) => {
      const key = obj(k);
      const kid = text(key?.kid);
      return key && kid ? [{ kid, algorithm: text(key.algorithm), curve: text(key.crv) }] : [];
    }),
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function readServices(): Promise<SourceResult<ServiceSummary[]>> {
  try {
    const engine = getEngine();
    const now = new Date();
    // The registry store is Redis in production; a stalled connection must not stall the snapshot.
    const list = await withTimeout(engine.services.list(), FETCH_TIMEOUT_MS);
    return {
      state: "live",
      data: list.map((service) => ({
        service_name: service.service_name,
        base_url: service.base_url ?? null,
        capabilities: service.capabilities.map((c) => c.name),
        authenticated: service.authenticated === true,
        telemetry_supported: service.telemetry_supported === true,
        registered_at: service.registered_at ?? null,
        last_seen: service.last_seen ?? null,
        stale: engine.services.isStale(service, now),
      })),
    };
  } catch (error) {
    return { state: "unavailable", error: error instanceof Error && error.message === "timeout" ? "service registry timeout" : "service registry unavailable" };
  }
}

/** Refresh the registry proof so the snapshot reports the current sync result, bounded so a hung registry cannot stall the view. */
async function syncRegistry(): Promise<void> {
  try {
    const engine = getEngine();
    await withTimeout(engine.syncRegistry(), FETCH_TIMEOUT_MS);
  } catch {
    // Reported through readRegistryStatus().
  }
}

function readRegistryStatus(): NetworkSnapshot["registry"] {
  try {
    const proof = getEngine().registryStatus();
    return { state: proof.state, source: proof.source, detail: proof.detail, checked_at: proof.checked_at };
  } catch {
    return null;
  }
}
