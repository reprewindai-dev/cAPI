/**
 * Covenant Governance Layer — policy composition.
 *
 * Merges system + owner + runtime policies, detects conflicts, resolves them
 * (system-wins, then most-restrictive), and computes the agent's *effective*
 * permissions for a capability right now. Also tracks delegation chains.
 */

import { randomUUID } from "crypto";
import type {
  DelegationChain,
  EffectivePermissions,
  Policy,
  PolicyComposition,
  PolicyConflict,
  PolicyRule,
  TrustScore,
} from "./types";

const TIER_RANK: Record<Policy["tier"], number> = {
  system: 0,
  owner: 1,
  runtime: 2,
};

export class GovernanceLayer {
  private delegations = new Map<string, DelegationChain>();

  /** Order policies by authority (system first). */
  private ordered(policies: Policy[]): Policy[] {
    return [...policies].sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier]);
  }

  private rulesFor(
    policies: Policy[],
    agent_id: string,
    capability_id: string,
  ): Array<{ policy: Policy; rule: PolicyRule }> {
    const out: Array<{ policy: Policy; rule: PolicyRule }> = [];
    for (const policy of policies) {
      for (const rule of policy.rules) {
        const principalMatch =
          rule.principal === "*" ||
          rule.principal === agent_id ||
          rule.principal.startsWith("role:");
        const actionMatch =
          rule.action === "*" ||
          rule.action === capability_id ||
          rule.action.split("|").includes(capability_id) ||
          rule.action.startsWith("category:");
        if (principalMatch && actionMatch) out.push({ policy, rule });
      }
    }
    return out;
  }

  /** Detect conflicting effects/conditions across applicable rules. */
  detectConflicts(
    matches: Array<{ policy: Policy; rule: PolicyRule }>,
  ): PolicyConflict[] {
    const conflicts: PolicyConflict[] = [];
    for (let i = 0; i < matches.length; i++) {
      for (let j = i + 1; j < matches.length; j++) {
        const a = matches[i];
        const b = matches[j];
        if (a.rule.effect !== b.rule.effect) {
          conflicts.push({
            conflict_id: randomUUID(),
            conflict_type: "allow-deny",
            source1: a.policy.policy_id,
            source2: b.policy.policy_id,
            conflicting_field: "effect",
            severity: "high",
            resolution: "system-wins, else deny (most-restrictive)",
            requires_admin_review: a.policy.tier === b.policy.tier,
          });
        }
        const ra = a.rule.conditions.rate_limit;
        const rb = b.rule.conditions.rate_limit;
        if (ra !== undefined && rb !== undefined && ra !== rb) {
          conflicts.push({
            conflict_id: randomUUID(),
            conflict_type: "rate-limit-mismatch",
            source1: a.policy.policy_id,
            source2: b.policy.policy_id,
            conflicting_field: "rate_limit",
            severity: "medium",
            resolution: `most-restrictive (${Math.min(ra, rb)}/min)`,
            requires_admin_review: false,
          });
        }
      }
    }
    return conflicts;
  }

  compose(
    policies: Policy[],
    agent_id: string,
    capability_id: string,
  ): {
    composition: PolicyComposition;
    matches: Array<{ policy: Policy; rule: PolicyRule }>;
  } {
    const ordered = this.ordered(policies);
    const matches = this.rulesFor(ordered, agent_id, capability_id);
    const conflicts = this.detectConflicts(matches);
    const composition: PolicyComposition = {
      composition_id: randomUUID(),
      agent_id,
      capability_id,
      timestamp: new Date().toISOString(),
      contributing_policies: [...new Set(matches.map((m) => m.policy.policy_id))],
      conflicts_detected: conflicts,
      resolution_method: "system-wins",
      is_valid: !conflicts.some((c) => c.requires_admin_review),
    };
    return { composition, matches };
  }

  /**
   * Compute effective permissions. System denials are absolute; otherwise the
   * most-restrictive allow wins. Trust + delegation depth fold in.
   */
  effectivePermissions(
    policies: Policy[],
    agent_id: string,
    capability_id: string,
    trust: TrustScore | undefined,
    delegationDepth: number,
  ): { permissions: EffectivePermissions; composition: PolicyComposition } {
    const { composition, matches } = this.compose(policies, agent_id, capability_id);

    const systemDeny = matches.find(
      (m) => m.policy.tier === "system" && m.rule.effect === "deny",
    );
    const allows = matches.filter((m) => m.rule.effect === "allow");
    const anyDeny = matches.find((m) => m.rule.effect === "deny");

    const canExecute =
      !systemDeny && allows.length > 0 && !(anyDeny && allows.length === 0);

    const rateLimits = allows
      .map((m) => m.rule.conditions.rate_limit)
      .filter((x): x is number => x !== undefined);
    const trustReqs = allows
      .map((m) => m.rule.conditions.trust_minimum)
      .filter((x): x is number => x !== undefined);
    const requiresApproval = allows.some((m) => m.rule.conditions.requires_approval);
    const approvalPaths = allows
      .map((m) => m.rule.conditions.approval_path)
      .filter((x): x is string => Boolean(x));
    const timeRestricted = allows.some((m) => Boolean(m.rule.conditions.time_window));

    const trustRequired = trustReqs.length ? Math.max(...trustReqs) : 0;
    const trustCurrent = Math.round(
      (trust?.score ?? 50) * Math.max(0.4, 1 - delegationDepth * 0.15),
    );

    const permissions: EffectivePermissions = {
      agent_id,
      capability_id,
      calculated_at: new Date().toISOString(),
      can_execute: canExecute && trustCurrent >= trustRequired,
      requires_approval: requiresApproval,
      approval_path: [...new Set(approvalPaths)],
      rate_limit: rateLimits.length ? Math.min(...rateLimits) : undefined,
      trust_required: trustRequired,
      trust_current: trustCurrent,
      time_restricted: timeRestricted,
      delegation_depth: delegationDepth,
      confidence_score: composition.is_valid ? 95 : 60,
    };
    return { permissions, composition };
  }

  registerDelegation(args: {
    source_agent: string;
    target_agent: string;
    capability_id: string;
    max_depth: number;
    parent?: DelegationChain;
  }): DelegationChain {
    const depth = args.parent ? args.parent.depth + 1 : 1;
    const chain: DelegationChain = {
      delegation_id: randomUUID(),
      source_agent: args.source_agent,
      target_agent: args.target_agent,
      capability_id: args.capability_id,
      timestamp: new Date().toISOString(),
      depth,
      max_depth: args.max_depth,
      trust_multiplier: Math.max(0.4, 1 - depth * 0.15),
      evidence_chain: args.parent ? [...args.parent.evidence_chain] : [],
      is_valid: depth <= args.max_depth,
      is_revoked: false,
      can_further_delegate: depth < args.max_depth,
    };
    this.delegations.set(`${args.target_agent}|${args.capability_id}`, chain);
    return chain;
  }

  getDelegation(agent_id: string, capability_id: string): DelegationChain | undefined {
    return this.delegations.get(`${agent_id}|${capability_id}`);
  }

  listDelegations(): DelegationChain[] {
    return [...this.delegations.values()];
  }
}
