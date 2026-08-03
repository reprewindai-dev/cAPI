/**
 * Universal Capability Mounts provide an additive, governed binding around the
 * existing Covenant runtime. Execute anchoring remains owned by the runtime's
 * Phase 7 evidence seal plus optional PGL forward. Decision-only (shadow-mode)
 * anchoring is a deliberate follow-up because it needs an evidence-sealing seam
 * in the runtime; this module does not fabricate an Evidence record.
 */

import { getEngine } from "./engine";
import type { ProcessOptions } from "./runtime";
import type {
  CapabilityIdentity,
  CapabilityMethod,
  CovenantRequest,
  CovenantResponse,
  EffectivePermissions,
  Severity,
} from "./types";

export type MountProtocol = CapabilityMethod | "graphql";
export type ExecutionLane = 1 | 2 | 3;
export type MountAuthority = "NONE" | "CAPPO";
export type MountDecision =
  | "ALLOW"
  | "DENY"
  | "HOLD"
  | "REQUIRE_APPROVAL"
  | "QUARANTINE";

export interface CapabilityMount {
  mount_id: string;
  capability: CapabilityIdentity;
  protocol: MountProtocol;
  lane: ExecutionLane;
  authority: MountAuthority;
  grants: string[];
  policy_version: string;
  provider_id: string;
  workspace_id?: string;
  connection_id?: string;
  risk?: Severity;
  evidence_anchor: "local" | "required";
  discovery: {
    discoverable: boolean;
    tags: string[];
    expires_at?: string;
  };
  registered_at: string;
  mount_version: number;
}

export interface MountDecisionEnvelope {
  mount_id: string;
  capability_id: string;
  decision: MountDecision;
  lane: ExecutionLane;
  authority_required: MountAuthority;
  requires_approval: boolean;
  approval_path: string[];
  trust_required: number;
  trust_current: number;
  reasons: string[];
  evaluated_at: string;
  expires_at: string;
}

export interface RegisterMountInput {
  mount_id: string;
  capability: CapabilityIdentity;
  protocol?: MountProtocol;
  lane?: ExecutionLane;
  authority?: MountAuthority;
  grants?: string[];
  policy_version?: string;
  provider_id?: string;
  workspace_id?: string;
  connection_id?: string;
  risk?: Severity;
  evidence_anchor?: "local" | "required";
  discovery?: {
    discoverable?: boolean;
    tags?: string[];
    expires_at?: string;
  };
}

type PermissionSubset = Pick<
  EffectivePermissions,
  "can_execute" | "requires_approval" | "approval_path" | "trust_required" | "trust_current"
>;

const MOUNT_PROTOCOLS: MountProtocol[] = ["mcp", "http", "https", "local", "graphql"];
const EXECUTION_LANES: ExecutionLane[] = [1, 2, 3];
const MOUNT_AUTHORITIES: MountAuthority[] = ["NONE", "CAPPO"];

declare global {
  // eslint-disable-next-line no-var
  var __capabilityMounts: Map<string, CapabilityMount> | undefined;
  // eslint-disable-next-line no-var
  var __capabilityMountGraphVersion: number | undefined;
}

function mountStore(): Map<string, CapabilityMount> {
  // This Map is the persistence seam for a Redis/DB-backed store later.
  return (globalThis.__capabilityMounts ??= new Map<string, CapabilityMount>());
}

function now(): string {
  return new Date().toISOString();
}

function isExpired(mount: CapabilityMount): boolean {
  return Boolean(mount.discovery.expires_at && Date.parse(mount.discovery.expires_at) <= Date.now());
}

function protocolFromEndpoint(endpoint: string): MountProtocol {
  const protocol = endpoint.split("://", 1)[0].toLowerCase() as MountProtocol;
  if (!MOUNT_PROTOCOLS.includes(protocol)) {
    throw new Error(`Unsupported capability endpoint protocol: ${protocol || "missing"}`);
  }
  return protocol;
}

function validateLane(lane: number): asserts lane is ExecutionLane {
  if (!EXECUTION_LANES.includes(lane as ExecutionLane)) {
    throw new Error("lane must be one of 1, 2, or 3");
  }
}

function validateAuthority(authority: MountAuthority): void {
  if (!MOUNT_AUTHORITIES.includes(authority)) {
    throw new Error("authority must be NONE or CAPPO");
  }
}

export function mapMountDecision(args: {
  permissions: PermissionSubset;
  safetyBlocking: boolean;
  affordable: boolean;
  lane: ExecutionLane;
  authority: MountAuthority;
}): { decision: MountDecision; reasons: string[] } {
  if (args.safetyBlocking) {
    return {
      decision: "QUARANTINE",
      reasons: ["safety_anomaly_block", "execution_requires_safety_review"],
    };
  }
  if (!args.permissions.can_execute) {
    return {
      decision: "DENY",
      reasons: ["policy_denied", "effective_permissions_disallow_execution"],
    };
  }
  if (!args.affordable) {
    return {
      decision: "DENY",
      reasons: ["budget_exceeded", "capability_cost_is_not_affordable"],
    };
  }
  if (args.lane === 3 || args.authority === "CAPPO") {
    return {
      decision: "HOLD",
      reasons: ["cappo_authorization_required", "external_authority_not_proven_inside_capi"],
    };
  }
  if (args.permissions.requires_approval) {
    return {
      decision: "REQUIRE_APPROVAL",
      reasons: ["approval_required", ...args.permissions.approval_path],
    };
  }
  return { decision: "ALLOW", reasons: ["permitted"] };
}

export class CapabilityMountRegistry {
  private readonly mounts = mountStore();

  get graphVersion(): number {
    return globalThis.__capabilityMountGraphVersion ?? 0;
  }

  private set graphVersion(value: number) {
    globalThis.__capabilityMountGraphVersion = value;
  }

  register(input: RegisterMountInput): CapabilityMount {
    if (!input || typeof input.mount_id !== "string" || !input.mount_id.trim()) {
      throw new Error("mount_id is required");
    }
    if (!input.capability || typeof input.capability !== "object") {
      throw new Error("capability is required");
    }
    if (
      typeof input.capability.capability_id !== "string" ||
      !input.capability.capability_id.trim()
    ) {
      throw new Error("capability.capability_id is required");
    }
    if (typeof input.capability.endpoint !== "string" || !input.capability.endpoint.trim()) {
      throw new Error("capability.endpoint is required");
    }

    const lane = input.lane ?? 1;
    validateLane(lane);
    const authority = input.authority ?? "NONE";
    validateAuthority(authority);
    const protocol = input.protocol ?? protocolFromEndpoint(input.capability.endpoint);
    if (!MOUNT_PROTOCOLS.includes(protocol)) {
      throw new Error(`Unsupported mount protocol: ${protocol}`);
    }

    const mountVersion = this.graphVersion + 1;
    this.graphVersion = mountVersion;
    const mount: CapabilityMount = {
      mount_id: input.mount_id.trim(),
      capability: input.capability,
      protocol,
      lane,
      authority,
      grants: input.grants ?? [],
      policy_version: input.policy_version ?? "1.0.0",
      provider_id: input.provider_id ?? input.capability.provider_id,
      workspace_id: input.workspace_id,
      connection_id: input.connection_id,
      risk: input.risk ?? input.capability.metadata.risk_level,
      evidence_anchor: input.evidence_anchor ?? "local",
      discovery: {
        discoverable: input.discovery?.discoverable ?? true,
        tags: input.discovery?.tags ?? [],
        expires_at: input.discovery?.expires_at,
      },
      registered_at: now(),
      mount_version: mountVersion,
    };

    this.mounts.set(mount.mount_id, mount);
    getEngine().runtime.registerCapability(input.capability);
    return mount;
  }

  get(mount_id: string): CapabilityMount | undefined {
    return this.mounts.get(mount_id);
  }

  getByCapabilityId(capability_id: string): CapabilityMount | undefined {
    return [...this.mounts.values()].find(
      (mount) => mount.capability.capability_id === capability_id,
    );
  }

  all(): CapabilityMount[] {
    return [...this.mounts.values()];
  }

  list(filter: {
    workspace_id?: string;
    lane?: ExecutionLane;
    discoverableOnly?: boolean;
    includeExpired?: boolean;
  } = {}): CapabilityMount[] {
    return this.all().filter((mount) => {
      if (!filter.includeExpired && isExpired(mount)) return false;
      if (filter.workspace_id !== undefined && mount.workspace_id !== filter.workspace_id) {
        return false;
      }
      if (filter.lane !== undefined && mount.lane !== filter.lane) return false;
      if (filter.discoverableOnly === true && !mount.discovery.discoverable) return false;
      return true;
    });
  }

  private permissionsFor(agent_id: string, capability_id: string): EffectivePermissions {
    const runtime = getEngine().runtime;
    const delegation = runtime.governance.getDelegation(agent_id, capability_id);
    return runtime.governance.effectivePermissions(
      runtime.activePolicies(),
      agent_id,
      capability_id,
      runtime.getTrust(agent_id),
      delegation?.depth ?? 0,
    ).permissions;
  }

  discover(
    agent_id: string,
    filter: { workspace_id?: string; lane?: ExecutionLane } = {},
  ): Array<{ mount: CapabilityMount; permissions: EffectivePermissions }> {
    return this.list({ ...filter, discoverableOnly: true }).map((mount) => ({
      mount,
      permissions: this.permissionsFor(agent_id, mount.capability.capability_id),
    }));
  }

  authorize(agent_id: string, mount_id: string): MountDecisionEnvelope {
    const mount = this.get(mount_id);
    if (!mount) throw new Error(`Mount not found: ${mount_id}`);
    if (isExpired(mount)) throw new Error(`Mount expired: ${mount_id}`);

    const runtime = getEngine().runtime;
    const permissions = this.permissionsFor(agent_id, mount.capability.capability_id);
    const safetyBlocking = runtime.safety
      .evaluate(agent_id, mount.capability.capability_id)
      .some((anomaly) => anomaly.recommended_action === "quarantine" || anomaly.recommended_action === "block");
    const affordable = runtime.intelligence.canAfford(agent_id, mount.capability.capability_id);
    const result = mapMountDecision({
      permissions,
      safetyBlocking,
      affordable,
      lane: mount.lane,
      authority: mount.authority,
    });
    const evaluatedAt = now();
    return {
      mount_id: mount.mount_id,
      capability_id: mount.capability.capability_id,
      decision: result.decision,
      lane: mount.lane,
      authority_required: mount.authority,
      requires_approval: permissions.requires_approval,
      approval_path: permissions.approval_path,
      trust_required: permissions.trust_required,
      trust_current: permissions.trust_current,
      reasons: result.reasons,
      evaluated_at: evaluatedAt,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
  }

  async execute(
    request: CovenantRequest,
    opts: ProcessOptions = {},
  ): Promise<CovenantResponse> {
    const mount = this.getByCapabilityId(request.capability_id);
    if (!mount) throw new Error(`Mount not found for capability: ${request.capability_id}`);
    if (isExpired(mount)) throw new Error(`Mount expired: ${mount.mount_id}`);
    if (mount.protocol === "graphql") {
      throw new Error(`Mount is not executable through Covenant: ${mount.mount_id}`);
    }
    return getEngine().runtime.process(request, { approvals: opts.approvals });
  }
}

export function getMountRegistry(): CapabilityMountRegistry {
  return new CapabilityMountRegistry();
}
