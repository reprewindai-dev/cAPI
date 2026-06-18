"use client";

import { Check, X, Activity } from "lucide-react";
import { useLive } from "@/components/useLive";
import { Eyebrow, Panel } from "@/components/ui";
import { cx, postJSON, refreshLive, SEVERITY_STYLE, short, timeAgo } from "@/components/util";
import type { QuarantinedRequest } from "@/lib/covenant/types";

const Q_TONE: Record<string, string> = {
  quarantined: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  approved: "border-signal/40 bg-signal/10 text-signal",
  denied: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  expired: "hairline text-mute",
};

export default function SafetyPage() {
  const { data, refresh } = useLive();
  const anomalies = data?.anomalies ?? [];
  const quarantine = data?.quarantine ?? [];

  const act = async (q: QuarantinedRequest, action: "approve" | "deny") => {
    const approver = `human:approver-${q.approvals_received.length + 1}`;
    await postJSON(`/api/quarantine/${q.quarantine_id}`, { action, approver });
    refresh();
    refreshLive();
  };

  return (
    <div className="mx-auto max-w-[1180px]">
      <Eyebrow>Safety · anomalies &amp; quorum</Eyebrow>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-white">
        Breach prevention, in the loop
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-mute">
        Behavioral baselines flag deviations in real time. High-severity calls are quarantined and
        held until an M-of-N human quorum signs off.
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_440px]">
        {/* quarantine queue */}
        <div className="space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-wider text-mute">Quarantine queue</div>
          {quarantine.length === 0 && (
            <Panel className="p-6 text-center text-sm text-mute">No quarantined requests.</Panel>
          )}
          {quarantine.map((q) => (
            <Panel key={q.quarantine_id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm text-white">
                    {q.agent_id} <span className="text-mute">→</span> {q.capability_id}
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-mute">{short(q.connection_id, 8)} · {timeAgo(q.created_at)}</div>
                </div>
                <span className={cx("rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider", Q_TONE[q.status])}>
                  {q.status}
                </span>
              </div>

              <div className="mt-2 font-mono text-[11px] text-amber-300/90">{q.quarantine_reason}</div>

              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {Array.from({ length: q.approvers_required }).map((_, i) => (
                    <span
                      key={i}
                      className={cx(
                        "h-2.5 w-2.5 rounded-full border",
                        i < q.approvals_received.length ? "border-signal bg-signal" : "border-white/20 bg-transparent",
                      )}
                    />
                  ))}
                  <span className="ml-2 font-mono text-[10px] text-mute">
                    {q.approvals_received.length}/{q.approvers_required} approvals · trust suppressed → {q.suppressed_trust_score}
                  </span>
                </div>
                {q.status === "quarantined" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => act(q, "approve")}
                      className="inline-flex items-center gap-1 rounded-md border border-signal/40 bg-signal/10 px-2.5 py-1 font-mono text-[10px] tracking-wider text-signal transition hover:bg-signal/20"
                    >
                      <Check size={11} /> APPROVE
                    </button>
                    <button
                      onClick={() => act(q, "deny")}
                      className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 font-mono text-[10px] tracking-wider text-rose-300 transition hover:bg-rose-500/20"
                    >
                      <X size={11} /> DENY
                    </button>
                  </div>
                )}
              </div>
            </Panel>
          ))}
        </div>

        {/* anomaly feed */}
        <div className="space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-wider text-mute">Anomaly feed</div>
          <Panel className="p-2">
            <div className="scroll-thin max-h-[560px] overflow-auto">
              {anomalies.length === 0 && (
                <div className="p-6 text-center text-sm text-mute">No anomalies detected.</div>
              )}
              {anomalies.map((a) => (
                <div key={a.detection_id} className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-white/[0.03]">
                  <Activity size={14} className={cx("mt-0.5 shrink-0", SEVERITY_STYLE[a.severity])} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white/90">{a.anomaly_type.replace(/_/g, " ")}</span>
                      <span className={cx("font-mono text-[10px] uppercase", SEVERITY_STYLE[a.severity])}>{a.severity}</span>
                    </div>
                    <div className="truncate font-mono text-[10px] text-mute">{a.summary}</div>
                    <div className="font-mono text-[10px] text-mute/70">
                      {a.agent_id} · score {a.anomaly_score} · {a.recommended_action} · {timeAgo(a.detected_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
