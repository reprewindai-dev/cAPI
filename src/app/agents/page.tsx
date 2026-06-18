"use client";

export const dynamic = "force-dynamic";

import { Power, ShieldCheck } from "lucide-react";
import { useLive } from "@/components/useLive";
import { Eyebrow, Panel, Meter } from "@/components/ui";
import { cx, postJSON, refreshLive, THREAT_STYLE, SEVERITY_STYLE } from "@/components/util";
import type { AgentView } from "@/lib/covenant/api";

export default function AgentsPage() {
  const { data, refresh } = useLive();
  const agents = data?.agents ?? [];

  const toggleSuspend = async (id: string) => {
    await postJSON(`/api/agent/${id}`, {});
    refresh();
    refreshLive();
  };

  return (
    <div className="mx-auto max-w-[1180px]">
      <Eyebrow>Agents · trust &amp; risk</Eyebrow>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-white">
        The fleet, scored continuously
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-mute">
        Trust moves on every covenant. Risk fuses trust, anomaly history, denials, and budget
        pressure into a live threat level — and tells you what to do about it.
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {agents.map((a) => (
          <AgentCard key={a.identity.agent_id} a={a} onToggle={() => toggleSuspend(a.identity.agent_id)} />
        ))}
      </div>
    </div>
  );
}

function AgentCard({ a, onToggle }: { a: AgentView; onToggle: () => void }) {
  const t = a.trust;
  return (
    <Panel className={cx("p-5", a.suspended && "opacity-70")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-display text-lg font-semibold text-white">{a.identity.agent_name}</span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-mute">
              {a.identity.metadata.tier} · {a.identity.metadata.inference_provider}
            </span>
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-mute">{a.identity.agent_id}</div>
        </div>
        <button
          onClick={onToggle}
          className={cx(
            "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-[10px] tracking-wider transition",
            a.suspended
              ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
              : "hairline bg-white/[0.03] text-mute hover:text-white",
          )}
        >
          <Power size={11} />
          {a.suspended ? "SUSPENDED" : "ACTIVE"}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-baseline justify-between font-mono text-[10px] text-mute">
            <span>TRUST</span>
            <span className="tnum text-base text-white">{t?.score ?? "—"}</span>
          </div>
          <div className="mt-1.5">
            <Meter value={t?.score ?? 0} tone={(t?.score ?? 0) >= 50 ? "signal" : "rose"} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-4 font-mono text-[10px] text-mute">
            <span>req {t?.total_requests ?? 0}</span>
            <span>esc {t?.escalation_events ?? 0}</span>
            <span>success {Math.round((t?.success_rate ?? 0) * 100)}%</span>
            <span>denials {Math.round((t?.denial_frequency ?? 0) * 100)}%</span>
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between font-mono text-[10px] text-mute">
            <span>RISK</span>
            <span className={cx("tnum text-base", THREAT_STYLE[a.risk.threat_level])}>
              {a.risk.overall_risk_score}
            </span>
          </div>
          <div className="mt-1.5">
            <Meter
              value={a.risk.overall_risk_score}
              tone={a.risk.threat_level === "red" ? "rose" : a.risk.threat_level === "green" ? "signal" : "amber"}
            />
          </div>
          <div className={cx("mt-2 font-mono text-[10px] uppercase tracking-wider", THREAT_STYLE[a.risk.threat_level])}>
            threat · {a.risk.threat_level}
          </div>
          <div className="mt-1 font-mono text-[10px] text-mute">spend {a.spend}</div>
        </div>
      </div>

      <div className="mt-4 border-t hairline pt-3">
        <div className="flex flex-wrap gap-1.5">
          {a.risk.risk_factors
            .filter((f) => f.contribution > 0)
            .map((f) => (
              <span key={f.factor_name} className="chip bg-white/[0.03] px-2 py-1 font-mono text-[10px] text-mute">
                <span className={SEVERITY_STYLE[f.severity]}>●</span> {f.factor_name} +{f.contribution}
              </span>
            ))}
        </div>
        <div className="mt-2 flex items-start gap-2 font-mono text-[11px] text-white/70">
          <ShieldCheck size={13} className="mt-0.5 shrink-0 text-signal" />
          <span>{a.risk.recommended_actions[0]}</span>
        </div>
      </div>
    </Panel>
  );
}
