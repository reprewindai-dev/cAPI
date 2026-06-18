"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { useLive } from "@/components/useLive";
import { Eyebrow, Panel, KeyVal } from "@/components/ui";
import { cx, getJSON, postJSON, refreshLive } from "@/components/util";
import type { EffectivePermissions, PolicyComposition } from "@/lib/covenant/types";

const TIER_TONE: Record<string, string> = {
  system: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  owner: "border-violet/40 bg-violet/10 text-violet",
  runtime: "border-signal/40 bg-signal/10 text-signal",
};

export default function GovernancePage() {
  const { data, refresh } = useLive();
  const policies = data?.policies ?? [];
  const agents = useMemo(() => data?.agents ?? [], [data]);
  const caps = useMemo(() => data?.capabilities ?? [], [data]);

  const [agent, setAgent] = useState("");
  const [cap, setCap] = useState("");
  const [result, setResult] = useState<{ permissions: EffectivePermissions; composition: PolicyComposition } | null>(null);

  useEffect(() => {
    if (!agent && agents.length) setAgent(agents[0].identity.agent_id);
    if (!cap && caps.length) setCap(caps[0].capability_id);
  }, [agents, caps, agent, cap]);

  useEffect(() => {
    if (!agent || !cap) return;
    getJSON<{ permissions: EffectivePermissions; composition: PolicyComposition }>(
      `/api/compose?agent_id=${agent}&capability_id=${cap}`,
    ).then(setResult);
  }, [agent, cap, data]);

  const toggle = async (id: string, enabled: boolean) => {
    await postJSON(`/api/policy/${id}`, { enabled });
    refresh();
    refreshLive();
  };

  return (
    <div className="mx-auto max-w-[1180px]">
      <Eyebrow>Governance · policy composition</Eyebrow>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-white">
        Three tiers, composed at call time
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-mute">
        System guardrails, owner intent, and runtime defaults merge into one verdict. Toggle a
        policy and watch the effective permissions recompute live.
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_420px]">
        {/* policies */}
        <div className="space-y-3">
          {policies
            .sort((a, b) => a.policy.tier.localeCompare(b.policy.tier))
            .map(({ policy, enabled }) => (
              <Panel key={policy.policy_id} className={cx("p-4", !enabled && "opacity-50")}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={cx("rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider", TIER_TONE[policy.tier])}>
                        {policy.tier}
                      </span>
                      <span className="text-sm font-medium text-white">{policy.policy_name}</span>
                      <span className="font-mono text-[10px] text-mute">v{policy.version}</span>
                    </div>
                    <div className="mt-2 space-y-1">
                      {policy.rules.map((r) => (
                        <div key={r.rule_id} className="font-mono text-[11px] text-mute">
                          <span className={r.effect === "deny" ? "text-rose-300" : "text-signal"}>{r.effect}</span>
                          {" "}
                          <span className="text-white/70">{r.principal}</span>
                          {" → "}
                          <span className="text-white/70">{r.action}</span>
                          {r.conditions.trust_minimum !== undefined && <span> · trust≥{r.conditions.trust_minimum}</span>}
                          {r.conditions.requires_approval && <span> · approval[{r.conditions.approval_path}]</span>}
                          {r.conditions.rate_limit !== undefined && <span> · {r.conditions.rate_limit}/min</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => toggle(policy.policy_id, !enabled)}
                    disabled={policy.tier === "system"}
                    className={cx(
                      "shrink-0 rounded-md border px-2.5 py-1 font-mono text-[10px] tracking-wider transition",
                      enabled ? "border-signal/40 bg-signal/10 text-signal" : "hairline text-mute",
                      policy.tier === "system" && "cursor-not-allowed opacity-60",
                    )}
                  >
                    {policy.tier === "system" ? "LOCKED" : enabled ? "ENABLED" : "DISABLED"}
                  </button>
                </div>
              </Panel>
            ))}
        </div>

        {/* composition probe */}
        <div className="space-y-4">
          <Panel className="p-5">
            <Eyebrow>Effective permissions probe</Eyebrow>
            <div className="mt-3 space-y-2">
              <select
                value={agent}
                onChange={(e) => setAgent(e.target.value)}
                className="w-full appearance-none rounded-lg border hairline bg-ink-900/70 px-3 py-2 text-sm text-white outline-none focus:border-signal/50"
              >
                {agents.map((a) => (
                  <option key={a.identity.agent_id} value={a.identity.agent_id}>{a.identity.agent_name}</option>
                ))}
              </select>
              <select
                value={cap}
                onChange={(e) => setCap(e.target.value)}
                className="w-full appearance-none rounded-lg border hairline bg-ink-900/70 px-3 py-2 text-sm text-white outline-none focus:border-signal/50"
              >
                {caps.map((c) => (
                  <option key={c.capability_id} value={c.capability_id}>{c.capability_name}</option>
                ))}
              </select>
            </div>

            {result && (
              <div className="mt-4">
                <div
                  className={cx(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 font-mono text-[11px] tracking-wider",
                    result.permissions.can_execute
                      ? "border-signal/40 bg-signal/10 text-signal"
                      : "border-rose-500/40 bg-rose-500/10 text-rose-300",
                  )}
                >
                  {result.permissions.can_execute ? <Check size={13} /> : <X size={13} />}
                  {result.permissions.can_execute ? "CAN EXECUTE" : "BLOCKED"}
                </div>
                <div className="mt-2">
                  <KeyVal k="trust" v={`${result.permissions.trust_current} / ${result.permissions.trust_required}`} />
                  <KeyVal k="approval" v={result.permissions.requires_approval ? result.permissions.approval_path.join(", ") || "required" : "none"} />
                  <KeyVal k="rate limit" v={result.permissions.rate_limit !== undefined ? `${result.permissions.rate_limit}/min` : "—"} />
                  <KeyVal k="confidence" v={`${result.permissions.confidence_score}%`} />
                  <KeyVal k="resolution" v={result.composition.resolution_method} />
                </div>
              </div>
            )}
          </Panel>

          {result && result.composition.conflicts_detected.length > 0 && (
            <Panel className="p-5">
              <Eyebrow>Conflicts resolved</Eyebrow>
              <div className="mt-3 space-y-2">
                {result.composition.conflicts_detected.map((c) => (
                  <div key={c.conflict_id} className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-3">
                    <div className="flex items-center gap-2 text-sm text-amber-300">
                      <AlertTriangle size={13} />
                      {c.conflict_type} · {c.conflicting_field}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-mute">
                      {c.source1} ↔ {c.source2}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-white/70">→ {c.resolution}</div>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
