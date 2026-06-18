"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { Check, X, Lock, Clock } from "lucide-react";
import { useLive } from "@/components/useLive";
import { Eyebrow, Panel, Meter } from "@/components/ui";
import { cx, getJSON } from "@/components/util";
import type { DiscoveredCapability } from "@/lib/covenant/api";

export default function RegistryPage() {
  const { data } = useLive();
  const agents = useMemo(() => data?.agents ?? [], [data]);
  const [agent, setAgent] = useState<string>("");
  const [discovered, setDiscovered] = useState<DiscoveredCapability[]>([]);

  useEffect(() => {
    if (!agent && agents.length) setAgent(agents[0].identity.agent_id);
  }, [agents, agent]);

  useEffect(() => {
    if (!agent) return;
    getJSON<{ capabilities: DiscoveredCapability[] }>(`/api/discover/${agent}`).then((d) =>
      setDiscovered(d.capabilities),
    );
  }, [agent, data]);

  return (
    <div className="mx-auto max-w-[1180px]">
      <Eyebrow>Capability registry</Eyebrow>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-white">
        What can this agent do — right now?
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-mute">
        Discovery isn&apos;t a static manifest. It&apos;s the live, policy-true answer: effective
        permissions computed from composed policies, current trust, and delegation depth.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {agents.map((a) => (
          <button
            key={a.identity.agent_id}
            onClick={() => setAgent(a.identity.agent_id)}
            className={cx(
              "rounded-lg border px-3 py-2 text-sm transition",
              agent === a.identity.agent_id
                ? "border-signal/50 bg-signal/10 text-signal"
                : "hairline bg-ink-800/50 text-mute hover:text-white",
            )}
          >
            {a.identity.agent_name}
            <span className="ml-2 font-mono text-[10px] text-mute">trust {a.trust?.score ?? "—"}</span>
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {discovered.map(({ capability, permissions }) => (
          <Panel key={capability.capability_id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{capability.capability_name}</span>
                  <span className="font-mono text-[10px] text-mute">{capability.metadata.category}</span>
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-mute">{capability.endpoint}</div>
              </div>
              <span
                className={cx(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[10px] tracking-wider",
                  permissions.can_execute
                    ? "border-signal/40 bg-signal/10 text-signal"
                    : "border-rose-500/40 bg-rose-500/10 text-rose-300",
                )}
              >
                {permissions.can_execute ? <Check size={11} /> : <X size={11} />}
                {permissions.can_execute ? "AUTHORIZED" : "BLOCKED"}
              </span>
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between font-mono text-[10px] text-mute">
                <span>trust {permissions.trust_current} / {permissions.trust_required} required</span>
                <span>conf {permissions.confidence_score}%</span>
              </div>
              <div className="mt-1.5">
                <Meter
                  value={permissions.trust_current}
                  max={Math.max(100, permissions.trust_required)}
                  tone={permissions.trust_current >= permissions.trust_required ? "signal" : "rose"}
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-[10px]">
              <Tag>{capability.metadata.cost}</Tag>
              {permissions.rate_limit !== undefined && <Tag>{permissions.rate_limit}/min</Tag>}
              {permissions.requires_approval && (
                <Tag tone="amber">
                  <Lock size={9} /> {permissions.approval_path.join(", ") || "approval"}
                </Tag>
              )}
              {permissions.time_restricted && (
                <Tag tone="violet">
                  <Clock size={9} /> time-boxed
                </Tag>
              )}
              {permissions.delegation_depth > 0 && <Tag tone="violet">delegated · depth {permissions.delegation_depth}</Tag>}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone?: "amber" | "violet" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1",
        tone === "amber"
          ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
          : tone === "violet"
            ? "border-violet/30 bg-violet/10 text-violet"
            : "hairline bg-white/[0.03] text-mute",
      )}
    >
      {children}
    </span>
  );
}
