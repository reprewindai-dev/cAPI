/**
 * Covenant Safety Layer — breach prevention.
 *
 * Behavioral baselines, real-time anomaly detection, trust suppression,
 * request quarantine, and M-of-N approval quorum.
 */

import { randomUUID } from "crypto";
import { hashObject } from "./crypto";
import type {
  AnomalyDetection,
  AnomalyType,
  BehavioralBaseline,
  QuarantinedRequest,
  RecommendedAction,
  Severity,
} from "./types";

interface WindowSample {
  timestamp: number;
  capability_id: string;
  failed: boolean;
}

export class SafetyLayer {
  private baselines = new Map<string, BehavioralBaseline>();
  private samples = new Map<string, WindowSample[]>();
  private anomalies: AnomalyDetection[] = [];
  private quarantine = new Map<string, QuarantinedRequest>();

  setBaseline(baseline: BehavioralBaseline): void {
    this.baselines.set(baseline.agent_id, baseline);
  }

  getBaseline(agent_id: string): BehavioralBaseline | undefined {
    return this.baselines.get(agent_id);
  }

  /** Record an observation and continuously learn the baseline. */
  observe(agent_id: string, capability_id: string, failed: boolean): void {
    const list = this.samples.get(agent_id) ?? [];
    list.push({ timestamp: Date.now(), capability_id, failed });
    // Keep a rolling 1h window of samples.
    const cutoff = Date.now() - 60 * 60 * 1000;
    this.samples.set(
      agent_id,
      list.filter((s) => s.timestamp >= cutoff),
    );

    const base = this.baselines.get(agent_id);
    if (base && !base.is_locked) {
      base.typical_capabilities[capability_id] =
        (base.typical_capabilities[capability_id] ?? 0) + 1;
      base.last_updated = new Date().toISOString();
    }
  }

  private severityFor(score: number): Severity {
    if (score >= 85) return "critical";
    if (score >= 65) return "high";
    if (score >= 40) return "medium";
    return "low";
  }

  private actionFor(severity: Severity): RecommendedAction {
    switch (severity) {
      case "critical":
        return "block";
      case "high":
        return "quarantine";
      case "medium":
        return "alert";
      default:
        return "log";
    }
  }

  /**
   * Evaluate the current request against the agent's baseline. Returns the
   * anomalies detected (possibly empty).
   */
  evaluate(agent_id: string, capability_id: string): AnomalyDetection[] {
    const base = this.baselines.get(agent_id);
    const window = this.samples.get(agent_id) ?? [];
    const found: AnomalyDetection[] = [];
    const now = new Date();

    if (!base) return found;

    // Request spike: requests in the last hour vs baseline mean + 3σ.
    const requestsThisHour = window.length;
    const spikeThreshold =
      base.avg_requests_per_hour + 3 * Math.max(base.std_dev_requests_per_hour, 1);
    if (requestsThisHour > spikeThreshold) {
      const deviation =
        (requestsThisHour - base.avg_requests_per_hour) /
        Math.max(base.std_dev_requests_per_hour, 1);
      found.push(
        this.mkAnomaly(agent_id, "request_spike", deviation, Math.min(100, 40 + deviation * 12),
          `${requestsThisHour} req/h vs baseline ${base.avg_requests_per_hour.toFixed(0)}`),
      );
    }

    // New capability access: capability never seen in baseline.
    if (
      Object.keys(base.typical_capabilities).length > 0 &&
      !base.typical_capabilities[capability_id]
    ) {
      found.push(
        this.mkAnomaly(agent_id, "new_capability_access", 2, 55,
          `First-ever access to ${capability_id}`),
      );
    }

    // Off-hours activity: outside typical active hours.
    const hour = now.getUTCHours();
    if (
      base.typical_time_windows.length > 0 &&
      !base.typical_time_windows.includes(hour)
    ) {
      found.push(
        this.mkAnomaly(agent_id, "off_hours_activity", 1.5, 42,
          `Activity at ${hour}:00 UTC outside typical window`),
      );
    }

    // Failure spike within the rolling window.
    const failures = window.filter((s) => s.failed).length;
    const failureRate = window.length ? failures / window.length : 0;
    if (failureRate > base.avg_failure_rate + 0.3 && window.length >= 5) {
      found.push(
        this.mkAnomaly(agent_id, "failure_spike", 3, 70,
          `Failure rate ${(failureRate * 100).toFixed(0)}% vs baseline ${(base.avg_failure_rate * 100).toFixed(0)}%`),
      );
    }

    this.anomalies.unshift(...found);
    return found;
  }

  private mkAnomaly(
    agent_id: string,
    type: AnomalyType,
    deviation: number,
    score: number,
    summary: string,
  ): AnomalyDetection {
    const severity = this.severityFor(score);
    const detection: AnomalyDetection = {
      detection_id: randomUUID(),
      agent_id,
      detected_at: new Date().toISOString(),
      anomaly_type: type,
      deviation_score: Number(deviation.toFixed(2)),
      anomaly_score: Math.round(score),
      severity,
      recommended_action: this.actionFor(severity),
      summary,
      evidence_hash: hashObject({ agent_id, type, summary, t: Date.now() }),
    };
    return detection;
  }

  /** Quarantine a request that tripped a high/critical anomaly. */
  quarantineRequest(args: {
    connection_id: string;
    agent_id: string;
    capability_id: string;
    anomalies: AnomalyDetection[];
    trust_score: number;
  }): QuarantinedRequest {
    const worst = args.anomalies.reduce<Severity>((acc, a) => {
      const rank = { low: 0, medium: 1, high: 2, critical: 3 };
      return rank[a.severity] > rank[acc] ? a.severity : acc;
    }, "low");
    const approversRequired = worst === "critical" ? 3 : 2;
    const record: QuarantinedRequest = {
      quarantine_id: randomUUID(),
      connection_id: args.connection_id,
      agent_id: args.agent_id,
      capability_id: args.capability_id,
      quarantine_reason: args.anomalies.map((a) => a.summary).join("; "),
      anomalies_detected: args.anomalies,
      suppressed_trust_score: Math.max(0, args.trust_score - 25),
      approvers_required: approversRequired,
      approvals_received: [],
      approval_deadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      status: "quarantined",
      created_at: new Date().toISOString(),
    };
    this.quarantine.set(record.quarantine_id, record);
    return record;
  }

  approve(quarantine_id: string, approver_id: string): QuarantinedRequest | undefined {
    const record = this.quarantine.get(quarantine_id);
    if (!record || record.status !== "quarantined") return record;
    if (!record.approvals_received.includes(approver_id)) {
      record.approvals_received.push(approver_id);
    }
    if (record.approvals_received.length >= record.approvers_required) {
      record.status = "approved";
      record.resolution_timestamp = new Date().toISOString();
    }
    return record;
  }

  deny(quarantine_id: string): QuarantinedRequest | undefined {
    const record = this.quarantine.get(quarantine_id);
    if (!record) return undefined;
    record.status = "denied";
    record.resolution_timestamp = new Date().toISOString();
    return record;
  }

  listAnomalies(limit = 50): AnomalyDetection[] {
    return this.anomalies.slice(0, limit);
  }

  listQuarantine(): QuarantinedRequest[] {
    return [...this.quarantine.values()].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
  }
}
