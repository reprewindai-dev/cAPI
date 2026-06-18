/**
 * Covenant Intelligence Layer — learning & prediction.
 *
 * Cost attribution + budgeting, behavioral cost analysis, and risk scoring
 * that fuses trust, anomaly history, and spend signals into a threat level.
 */

import { randomUUID } from "crypto";
import type {
  AnomalyDetection,
  CostAllocation,
  CostAllocationRecord,
  CostModel,
  RiskFactor,
  RiskProfile,
  ThreatLevel,
  TrustScore,
} from "./types";

export class IntelligenceLayer {
  private costModels = new Map<string, CostModel>();
  private allocations = new Map<string, CostAllocation>(); // key: agent|capability
  private records: CostAllocationRecord[] = [];

  private key(agent_id: string, capability_id: string): string {
    return `${agent_id}|${capability_id}`;
  }

  registerCostModel(model: CostModel): void {
    this.costModels.set(model.capability_id, model);
  }

  getCostModel(capability_id: string): CostModel | undefined {
    return this.costModels.get(capability_id);
  }

  allocateBudget(agent_id: string, capability_id: string, budget: number): void {
    this.allocations.set(this.key(agent_id, capability_id), {
      agent_id,
      capability_id,
      used: 0,
      budget,
      remaining: budget,
      last_reset: new Date().toISOString(),
    });
  }

  getAllocation(agent_id: string, capability_id: string): CostAllocation | undefined {
    return this.allocations.get(this.key(agent_id, capability_id));
  }

  /** Can the agent afford one call of this capability right now? */
  canAfford(agent_id: string, capability_id: string): boolean {
    const model = this.costModels.get(capability_id);
    if (!model || model.cost_per_call === 0) return true;
    const alloc =
      this.allocations.get(this.key(agent_id, capability_id)) ??
      this.bootstrapAllocation(agent_id, model);
    return alloc.remaining >= model.cost_per_call;
  }

  private bootstrapAllocation(agent_id: string, model: CostModel): CostAllocation {
    const alloc: CostAllocation = {
      agent_id,
      capability_id: model.capability_id,
      used: 0,
      budget: model.budget_per_agent,
      remaining: model.budget_per_agent,
      last_reset: new Date().toISOString(),
    };
    this.allocations.set(this.key(agent_id, model.capability_id), alloc);
    return alloc;
  }

  /** Charge a call against the agent's budget and record the attribution. */
  charge(agent_id: string, capability_id: string): CostAllocationRecord {
    const model = this.costModels.get(capability_id);
    const cost = model?.cost_per_call ?? 0;
    const currency = model?.currency ?? "credits";
    const alloc =
      this.allocations.get(this.key(agent_id, capability_id)) ??
      (model ? this.bootstrapAllocation(agent_id, model) : undefined);

    let action: CostAllocationRecord["action_taken"] = "allowed";
    let exceeded = false;
    if (alloc) {
      exceeded = alloc.remaining - cost < 0;
      if (exceeded) {
        const overage = model?.overage_policy ?? "deny";
        action =
          overage === "deny"
            ? "denied"
            : overage === "escalate"
              ? "escalated"
              : "auto_charged";
      }
      if (action !== "denied") {
        alloc.used += cost;
        alloc.remaining = alloc.budget - alloc.used;
      }
    }

    const record: CostAllocationRecord = {
      record_id: randomUUID(),
      agent_id,
      capability_id,
      timestamp: new Date().toISOString(),
      cost,
      currency,
      budget_after: alloc?.remaining ?? 0,
      budget_exceeded: exceeded,
      action_taken: action,
    };
    this.records.unshift(record);
    return record;
  }

  totalSpend(agent_id: string): number {
    return this.records
      .filter((r) => r.agent_id === agent_id && r.action_taken !== "denied")
      .reduce((sum, r) => sum + r.cost, 0);
  }

  listRecords(limit = 50): CostAllocationRecord[] {
    return this.records.slice(0, limit);
  }

  /**
   * Fuse trust, anomaly history, and spend into a 0-100 risk score and a
   * threat level — the predictive heartbeat of the system.
   */
  assessRisk(
    trust: TrustScore | undefined,
    recentAnomalies: AnomalyDetection[],
    spend: number,
    budget: number,
  ): RiskProfile {
    const factors: RiskFactor[] = [];

    const trustScore = trust?.score ?? 50;
    const trustRisk = Math.max(0, (60 - trustScore) * 1.2);
    factors.push({
      factor_name: "Low trust score",
      contribution: Math.round(trustRisk),
      severity: trustScore < 30 ? "high" : trustScore < 55 ? "medium" : "low",
    });

    const anomalyRisk = Math.min(
      45,
      recentAnomalies.reduce((s, a) => s + a.anomaly_score * 0.15, 0),
    );
    factors.push({
      factor_name: "Recent anomalies",
      contribution: Math.round(anomalyRisk),
      severity: anomalyRisk > 30 ? "high" : anomalyRisk > 12 ? "medium" : "low",
    });

    const denialRisk = (trust?.denial_frequency ?? 0) * 30;
    factors.push({
      factor_name: "Denial frequency",
      contribution: Math.round(Math.min(25, denialRisk)),
      severity: denialRisk > 15 ? "medium" : "low",
    });

    const budgetRatio = budget > 0 ? spend / budget : 0;
    const budgetRisk = budgetRatio > 0.9 ? 15 : budgetRatio > 0.7 ? 8 : 0;
    factors.push({
      factor_name: "Budget pressure",
      contribution: budgetRisk,
      severity: budgetRisk >= 15 ? "medium" : "low",
    });

    const overall = Math.min(
      100,
      Math.round(factors.reduce((s, f) => s + f.contribution, 0)),
    );

    const threat: ThreatLevel =
      overall >= 75 ? "red" : overall >= 50 ? "orange" : overall >= 25 ? "yellow" : "green";

    const recommended: string[] = [];
    if (threat === "red") recommended.push("Suspend agent pending review");
    if (anomalyRisk > 20) recommended.push("Require approval quorum for next 10 calls");
    if (trustScore < 40) recommended.push("Lower rate limit until trust recovers");
    if (budgetRatio > 0.9) recommended.push("Escalate budget overage to owner");
    if (recommended.length === 0) recommended.push("Continue monitoring");

    return {
      agent_id: trust?.agent_id ?? "unknown",
      overall_risk_score: overall,
      threat_level: threat,
      risk_factors: factors,
      last_assessed: new Date().toISOString(),
      recommended_actions: recommended,
    };
  }
}
