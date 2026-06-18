/**
 * Covenant Runtime — the 9-phase governed connection pipeline.
 *
 * Every call flows through: Identity & Security → Capability & Policy →
 * Safety & Anomaly → Cost & Budget → Approval → Execution → Evidence & Proof →
 * Audit & Compliance → Response. Each phase records a trace entry so the verdict
 * is fully explainable. The connection itself is the asset.
 */

import { randomUUID } from "crypto";
import {
  canonicalRequestMessage,
  hashObject,
  sha256,
  verifyMessage,
} from "./crypto";
import { SafetyLayer } from "./safety";
import { IntelligenceLayer } from "./intelligence";
import { GovernanceLayer } from "./governance";
import type {
  AgentIdentity,
  CapabilityIdentity,
  CovenantRequest,
  CovenantResponse,
  Decision,
  Evidence,
  PhaseStatus,
  PhaseTrace,
  Policy,
  TrustScore,
} from "./types";

export interface ProcessOptions {
  /** Approver ids supplied with the call (satisfies approval gates). */
  approvals?: string[];
  /** Skip a phase's enforcement to demonstrate its effect (console control). */
  bypass?: { safety?: boolean; cost?: boolean; policy?: boolean };
}

export class CovenantRuntime {
  agents = new Map<string, AgentIdentity>();
  capabilities = new Map<string, CapabilityIdentity>();
  policies = new Map<string, Policy>();
  trust = new Map<string, TrustScore>();
  suspended = new Set<string>();

  private evidenceLedger = new Map<string, Evidence>();
  private auditLog: Evidence[] = [];
  private lastEvidenceHash: string | null = null;
  private seenConnections = new Set<string>();
  private rateWindow = new Map<string, number[]>();

  readonly safety = new SafetyLayer();
  readonly intelligence = new IntelligenceLayer();
  readonly governance = new GovernanceLayer();

  // ---- registration ---------------------------------------------------------

  registerAgent(agent: AgentIdentity): void {
    this.agents.set(agent.agent_id, agent);
    if (!this.trust.has(agent.agent_id)) {
      const initialScore =
        agent.metadata.tier === "system" ? 95 : agent.metadata.tier === "service" ? 78 : 52;
      this.trust.set(agent.agent_id, {
        agent_id: agent.agent_id,
        score: initialScore,
        success_rate: 1,
        policy_adherence: 1,
        denial_frequency: 0,
        escalation_events: 0,
        total_requests: 0,
        last_updated: new Date().toISOString(),
      });
    }
  }

  registerCapability(cap: CapabilityIdentity): void {
    this.capabilities.set(cap.capability_id, cap);
  }

  registerPolicy(policy: Policy): void {
    this.policies.set(policy.policy_id, policy);
  }

  setPolicyEnabled(policy_id: string, enabled: boolean): void {
    // Toggling is modeled by parking the policy under a disabled key.
    const disabledKey = `__disabled__${policy_id}`;
    if (enabled) {
      const parked = this.policies.get(disabledKey);
      if (parked) {
        this.policies.set(policy_id, parked);
        this.policies.delete(disabledKey);
      }
    } else {
      const p = this.policies.get(policy_id);
      if (!p) return;
      this.policies.set(disabledKey, p);
      this.policies.delete(policy_id);
    }
  }

  activePolicies(): Policy[] {
    return [...this.policies.entries()]
      .filter(([k]) => !k.startsWith("__disabled__"))
      .map(([, v]) => v);
  }

  listPoliciesWithState(): Array<{ policy: Policy; enabled: boolean }> {
    const seen = new Map<string, { policy: Policy; enabled: boolean }>();
    for (const [k, v] of this.policies.entries()) {
      const enabled = !k.startsWith("__disabled__");
      seen.set(v.policy_id, { policy: v, enabled });
    }
    return [...seen.values()];
  }

  toggleAgentSuspension(agent_id: string): boolean {
    if (this.suspended.has(agent_id)) {
      this.suspended.delete(agent_id);
      return false;
    }
    this.suspended.add(agent_id);
    return true;
  }

  getTrust(agent_id: string): TrustScore | undefined {
    return this.trust.get(agent_id);
  }

  // ---- trust math -----------------------------------------------------------

  private applyTrust(agent_id: string, outcome: Decision): number {
    const t = this.trust.get(agent_id);
    if (!t) return 0;
    t.total_requests += 1;
    let delta = 0;
    if (outcome === "authorized") {
      delta = 2;
      t.success_rate = Math.min(1, t.success_rate * 0.95 + 0.05);
    } else if (outcome === "denied") {
      delta = -5;
      t.denial_frequency = Math.min(1, t.denial_frequency + 0.05);
      t.policy_adherence = Math.max(0, t.policy_adherence - 0.03);
    } else if (outcome === "quarantined") {
      delta = -3;
      t.escalation_events += 1;
    } else {
      delta = -1;
    }
    t.score = Math.max(0, Math.min(100, t.score + delta));
    t.last_updated = new Date().toISOString();
    return delta;
  }

  // ---- evidence -------------------------------------------------------------

  private generateEvidence(
    request: CovenantRequest,
    agent: AgentIdentity,
    capability: CapabilityIdentity | undefined,
    status: Decision,
    policy_id: string,
    output: Record<string, unknown>,
    executionMs: number,
  ): Evidence {
    const now = new Date().toISOString();
    const evidence: Evidence = {
      evidence_id: randomUUID(),
      connection_id: request.connection_id,
      pgl_hash: "",
      timestamp: now,
      who: {
        agent_id: agent.agent_id,
        agent_public_key: agent.public_key,
        owner_id: agent.owner_id,
      },
      what: {
        capability_id: request.capability_id,
        capability_name: capability?.capability_name ?? "unknown",
        action: request.action,
      },
      when: { requested_at: request.timestamp, executed_at: now, completed_at: now },
      why: {
        policy_applied: policy_id,
        policy_version: this.policies.get(policy_id)?.version ?? "n/a",
        authorization_proof: request.agent_signature.slice(0, 24),
        request_context: Buffer.from(JSON.stringify(request.context)).toString("base64"),
      },
      how: {
        method: (capability?.endpoint.split("://")[0] as Evidence["how"]["method"]) ?? "local",
        endpoint: capability?.endpoint ?? "local://none",
        retry_count: 0,
      },
      result: {
        status,
        output_hash: sha256(JSON.stringify(output)),
        output_size: JSON.stringify(output).length,
        execution_time_ms: executionMs,
      },
      compliance: {
        audit_logged: true,
        regulatory_category: capability?.metadata.category ?? "tool",
        data_classification: "internal",
        retention_policy: "7y",
      },
      previous_hash: this.lastEvidenceHash ?? undefined,
    };
    evidence.pgl_hash = hashObject({
      ...evidence,
      pgl_hash: undefined,
    });
    this.lastEvidenceHash = evidence.pgl_hash;
    this.evidenceLedger.set(evidence.pgl_hash, evidence);
    this.auditLog.unshift(evidence);
    return evidence;
  }

  getEvidence(hash: string): Evidence | undefined {
    return this.evidenceLedger.get(hash);
  }

  getAuditLog(limit = 100): Evidence[] {
    return this.auditLog.slice(0, limit);
  }

  /** Walk the hash chain backwards from a given evidence hash. */
  replay(hash: string): { evidence?: Evidence; chain: Evidence[] } {
    const evidence = this.evidenceLedger.get(hash);
    if (!evidence) return { chain: [] };
    const chain: Evidence[] = [evidence];
    let cursor = evidence;
    while (cursor.previous_hash) {
      const prev = this.evidenceLedger.get(cursor.previous_hash);
      if (!prev) break;
      chain.unshift(prev);
      cursor = prev;
    }
    return { evidence, chain };
  }

  // ---- the pipeline ---------------------------------------------------------

  process(request: CovenantRequest, opts: ProcessOptions = {}): CovenantResponse {
    const trace: PhaseTrace[] = [];
    const t0 = performance.now();
    const mark = (
      phase: number,
      name: string,
      status: PhaseStatus,
      summary: string,
      detail: Record<string, unknown>,
      startedAt: number,
    ): void => {
      trace.push({
        phase,
        name,
        status,
        duration_ms: Number((performance.now() - startedAt).toFixed(2)),
        summary,
        detail,
      });
    };

    const fail = (code: string, message: string): CovenantResponse => {
      const delta = this.applyTrust(request.agent_id, "error");
      return {
        connection_id: request.connection_id,
        status: "error",
        error: { code, message },
        metadata: {
          trust_delta: delta,
          new_trust_score: this.trust.get(request.agent_id)?.score ?? 0,
          audit_logged: false,
        },
        trace,
      };
    };

    // ===== PHASE 1 — IDENTITY & SECURITY =====
    let p = performance.now();
    const agent = this.agents.get(request.agent_id);
    if (!agent) {
      mark(1, "Identity & Security", "fail", "Agent not found", { agent_id: request.agent_id }, p);
      return fail("401", "Agent not found");
    }
    if (this.suspended.has(agent.agent_id)) {
      mark(1, "Identity & Security", "fail", "Agent suspended", { agent_id: agent.agent_id }, p);
      return fail("403", "Agent is suspended");
    }
    const message = canonicalRequestMessage(request);
    const signatureValid = verifyMessage(message, request.agent_signature, agent.public_key);
    if (!signatureValid) {
      mark(1, "Identity & Security", "fail", "Invalid Ed25519 signature", {
        agent: agent.agent_name,
      }, p);
      return fail("401", "Invalid signature");
    }
    if (this.seenConnections.has(request.connection_id)) {
      mark(1, "Identity & Security", "fail", "Replay detected (duplicate connection_id)", {
        connection_id: request.connection_id,
      }, p);
      this.applyTrust(request.agent_id, "denied");
      return fail("403", "Duplicate request detected (replay attack)");
    }
    this.seenConnections.add(request.connection_id);
    mark(1, "Identity & Security", "pass", `Verified ${agent.agent_name} · Ed25519 ok · no replay`, {
      agent: agent.agent_name,
      provider: agent.metadata.inference_provider,
      tier: agent.metadata.tier,
      signature_valid: true,
    }, p);

    // ===== PHASE 2 — CAPABILITY & POLICY =====
    p = performance.now();
    const capability = this.capabilities.get(request.capability_id);
    if (!capability) {
      mark(2, "Capability & Policy", "fail", "Capability not found", {
        capability_id: request.capability_id,
      }, p);
      return fail("404", "Capability not found");
    }
    const trust = this.trust.get(request.agent_id);
    const delegation = this.governance.getDelegation(request.agent_id, request.capability_id);
    const { permissions, composition } = this.governance.effectivePermissions(
      this.activePolicies(),
      request.agent_id,
      request.capability_id,
      trust,
      delegation?.depth ?? 0,
    );
    const policyId = composition.contributing_policies[0] ?? "default-deny";
    const policyAuthorized = opts.bypass?.policy ? true : permissions.can_execute;

    if (!policyAuthorized) {
      mark(2, "Capability & Policy", "fail",
        `Denied · trust ${permissions.trust_current}/${permissions.trust_required} req`, {
          capability: capability.capability_name,
          effective_permissions: permissions,
          conflicts: composition.conflicts_detected,
        }, p);
      const ev = this.generateEvidence(request, agent, capability, "denied", policyId, {
        reason: "policy_denied",
      }, 0);
      const delta = this.applyTrust(request.agent_id, "denied");
      this.safety.observe(request.agent_id, request.capability_id, true);
      return {
        connection_id: request.connection_id,
        status: "denied",
        evidence_hash: ev.pgl_hash,
        error: {
          code: "403",
          message: "Policy denied",
          remediation: {
            policy_id: policyId,
            trust_required: permissions.trust_required,
            trust_current: permissions.trust_current,
            requires_approval: permissions.requires_approval,
            approval_path: permissions.approval_path,
          },
        },
        metadata: {
          trust_delta: delta,
          new_trust_score: this.trust.get(request.agent_id)?.score ?? 0,
          audit_logged: true,
        },
        trace,
      };
    }
    mark(2, "Capability & Policy", composition.conflicts_detected.length ? "warn" : "pass",
      `Authorized by ${composition.contributing_policies.length} polic${composition.contributing_policies.length === 1 ? "y" : "ies"}` +
        (composition.conflicts_detected.length ? ` · ${composition.conflicts_detected.length} conflict(s) resolved` : ""),
      {
        capability: capability.capability_name,
        effective_permissions: permissions,
        contributing_policies: composition.contributing_policies,
        conflicts: composition.conflicts_detected,
        resolution_method: composition.resolution_method,
      }, p);

    // ===== PHASE 3 — SAFETY & ANOMALY =====
    p = performance.now();
    const anomalies = opts.bypass?.safety
      ? []
      : this.safety.evaluate(request.agent_id, request.capability_id);
    const blocking = anomalies.filter(
      (a) => a.recommended_action === "quarantine" || a.recommended_action === "block",
    );
    if (blocking.length > 0) {
      const q = this.safety.quarantineRequest({
        connection_id: request.connection_id,
        agent_id: request.agent_id,
        capability_id: request.capability_id,
        anomalies: blocking,
        trust_score: trust?.score ?? 50,
      });
      mark(3, "Safety & Anomaly", "fail",
        `Quarantined · ${blocking.length} anomaly(ies) · ${q.approvers_required}-of-N quorum required`, {
          anomalies: blocking,
          quarantine_id: q.quarantine_id,
        }, p);
      const ev = this.generateEvidence(request, agent, capability, "quarantined", policyId, {
        quarantine_id: q.quarantine_id,
      }, 0);
      const delta = this.applyTrust(request.agent_id, "quarantined");
      return {
        connection_id: request.connection_id,
        status: "quarantined",
        evidence_hash: ev.pgl_hash,
        error: {
          code: "423",
          message: "Request quarantined pending approval quorum",
          remediation: { quarantine_id: q.quarantine_id, approvers_required: q.approvers_required },
        },
        metadata: {
          trust_delta: delta,
          new_trust_score: this.trust.get(request.agent_id)?.score ?? 0,
          audit_logged: true,
        },
        trace,
      };
    }
    mark(3, "Safety & Anomaly", anomalies.length ? "warn" : "pass",
      anomalies.length ? `${anomalies.length} low-severity signal(s) logged` : "No anomalies · within baseline", {
        anomalies,
        baseline: this.safety.getBaseline(request.agent_id),
      }, p);

    // ===== PHASE 4 — COST & BUDGET =====
    p = performance.now();
    const affordable = opts.bypass?.cost ? true : this.intelligence.canAfford(request.agent_id, request.capability_id);
    const model = this.intelligence.getCostModel(request.capability_id);
    if (!affordable) {
      mark(4, "Cost & Budget", "fail", "Budget exceeded", {
        cost_model: model,
        allocation: this.intelligence.getAllocation(request.agent_id, request.capability_id),
      }, p);
      const ev = this.generateEvidence(request, agent, capability, "denied", policyId, {
        reason: "budget_exceeded",
      }, 0);
      const delta = this.applyTrust(request.agent_id, "denied");
      return {
        connection_id: request.connection_id,
        status: "denied",
        evidence_hash: ev.pgl_hash,
        error: { code: "402", message: "Budget exceeded", remediation: { overage_policy: model?.overage_policy } },
        metadata: {
          trust_delta: delta,
          new_trust_score: this.trust.get(request.agent_id)?.score ?? 0,
          audit_logged: true,
        },
        trace,
      };
    }
    const charge = this.intelligence.charge(request.agent_id, request.capability_id);
    mark(4, "Cost & Budget", "pass",
      model ? `Charged ${charge.cost} ${charge.currency} · ${charge.budget_after} remaining` : "Free capability", {
        charge,
        cost_model: model,
      }, p);

    // ===== PHASE 5 — APPROVAL =====
    p = performance.now();
    if (permissions.requires_approval) {
      const provided = new Set(opts.approvals ?? []);
      const satisfied = permissions.approval_path.length
        ? permissions.approval_path.every((a) => provided.has(a))
        : provided.size > 0;
      if (!satisfied) {
        mark(5, "Approval", "fail", `Approval required from: ${permissions.approval_path.join(", ") || "any approver"}`, {
          approval_path: permissions.approval_path,
          provided: [...provided],
        }, p);
        const ev = this.generateEvidence(request, agent, capability, "quarantined", policyId, {
          reason: "awaiting_approval",
        }, 0);
        const delta = this.applyTrust(request.agent_id, "quarantined");
        return {
          connection_id: request.connection_id,
          status: "quarantined",
          evidence_hash: ev.pgl_hash,
          error: {
            code: "428",
            message: "Approval required",
            remediation: { approval_path: permissions.approval_path },
          },
          metadata: {
            trust_delta: delta,
            new_trust_score: this.trust.get(request.agent_id)?.score ?? 0,
            audit_logged: true,
          },
          trace,
        };
      }
      mark(5, "Approval", "pass", `Approved by ${[...provided].join(", ")}`, { approvers: [...provided] }, p);
    } else {
      mark(5, "Approval", "skipped", "No approval gate on this covenant", {}, p);
    }

    // ===== PHASE 6 — EXECUTION =====
    p = performance.now();
    const execStart = performance.now();
    const output = this.executeCapability(capability, request);
    const executionMs = Number((performance.now() - execStart).toFixed(2));
    mark(6, "Execution", "pass", `${capability.endpoint} · ${executionMs}ms`, {
      method: capability.endpoint.split("://")[0],
      endpoint: capability.endpoint,
      output,
    }, p);

    // ===== PHASE 7 — EVIDENCE & PROOF =====
    p = performance.now();
    const evidence = this.generateEvidence(request, agent, capability, "authorized", policyId, output, executionMs);
    mark(7, "Evidence & Proof", "pass", `Sealed · ${evidence.pgl_hash.slice(0, 16)}…`, {
      pgl_hash: evidence.pgl_hash,
      previous_hash: evidence.previous_hash,
      output_hash: evidence.result.output_hash,
    }, p);

    // ===== PHASE 8 — AUDIT & COMPLIANCE =====
    p = performance.now();
    this.safety.observe(request.agent_id, request.capability_id, false);
    mark(8, "Audit & Compliance", "pass", `Logged · retained ${evidence.compliance.retention_policy} · ${evidence.compliance.data_classification}`, {
      compliance: evidence.compliance,
    }, p);

    // ===== PHASE 9 — RESPONSE =====
    p = performance.now();
    const delta = this.applyTrust(request.agent_id, "authorized");
    const newScore = this.trust.get(request.agent_id)?.score ?? 0;
    mark(9, "Response", "pass", `authorized · trust ${delta >= 0 ? "+" : ""}${delta} → ${newScore}`, {
      trust_delta: delta,
      new_trust_score: newScore,
      total_pipeline_ms: Number((performance.now() - t0).toFixed(2)),
    }, p);

    return {
      connection_id: request.connection_id,
      status: "authorized",
      evidence_hash: evidence.pgl_hash,
      result: {
        output,
        output_hash: evidence.result.output_hash,
        execution_time_ms: executionMs,
      },
      metadata: { trust_delta: delta, new_trust_score: newScore, audit_logged: true },
      trace,
    };
  }

  /** Deterministic capability execution keyed off method/category. */
  private executeCapability(
    cap: CapabilityIdentity,
    request: CovenantRequest,
  ): Record<string, unknown> {
    const method = cap.endpoint.split("://")[0];
    const base = {
      capability: cap.capability_name,
      method,
      action: request.action,
    };
    switch (cap.metadata.category) {
      case "database":
        return { ...base, rows: 3, query_ok: true, sample: request.input };
      case "tool":
        return { ...base, ok: true, result: `executed ${request.action}`, echo: request.input };
      case "service":
        return { ...base, status: 200, body: { ok: true, input: request.input } };
      case "agent":
        return { ...base, delegated: true, sub_result: "completed" };
      default:
        return { ...base, ok: true };
    }
  }
}
