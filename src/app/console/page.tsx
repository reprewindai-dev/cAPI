"use client";

import { useEffect, useMemo, useState } from "react";
import { Play, Beaker } from "lucide-react";
import { useLive } from "@/components/useLive";
import { Pipeline } from "@/components/Pipeline";
import { Eyebrow, LiveDot, Panel, Verdict, KeyVal } from "@/components/ui";
import { cx, short } from "@/components/util";
import type { CovenantResponse } from "@/lib/covenant/types";

interface Preset {
  label: string;
  desc: string;
  agent: string;
  cap: string;
  action: string;
  input: string;
  approvals?: string;
}

const PRESETS: Preset[] = [
  { label: "Clean read", desc: "in-policy, in-budget", agent: "agent-atlas", cap: "cap-db-read", action: "select", input: '{ "table": "customers", "limit": 10 }' },
  { label: "Payment · needs quorum", desc: "approval gate fires", agent: "agent-ledger", cap: "cap-payment", action: "issue", input: '{ "amount": 240, "to": "vendor-9" }' },
  { label: "Payment · approved", desc: "CFO signs off", agent: "agent-ledger", cap: "cap-payment", action: "issue", input: '{ "amount": 240, "to": "vendor-9" }', approvals: "human:cfo" },
  { label: "Policy denial", desc: "no grant for this agent", agent: "agent-echo", cap: "cap-db-write", action: "update", input: '{ "id": 7 }' },
  { label: "System-denied purge", desc: "immutable guardrail", agent: "agent-atlas", cap: "cap-purge", action: "purge", input: "{}" },
];

/**
 * Execution no longer leaves this page. The legacy cAPI execution proxy is
 * retired (410) and cAPI accepts no caller-supplied approvals, tamper or
 * bypass controls; consequence-bearing calls run through CAPPO's /v1/exec via
 * the Interlink bridge. The builder stays as a reference for the call shape.
 */
const EXECUTION_MOVED =
  "Execution moved to CAPPO via the Interlink bridge. This console no longer submits covenants; use the governed /v1/exec boundary.";

export default function ConsolePage() {
  const { data } = useLive();
  const [agent, setAgent] = useState("agent-atlas");
  const [cap, setCap] = useState("cap-db-read");
  const [action, setAction] = useState("select");
  const [input, setInput] = useState('{ "table": "customers", "limit": 10 }');
  const [approvals, setApprovals] = useState("");
  // Read-only: nothing on this page produces a response any more.
  const [resp] = useState<CovenantResponse | null>(null);
  const [runId] = useState(0);

  const agents = useMemo(() => data?.agents ?? [], [data]);
  const caps = useMemo(() => data?.capabilities ?? [], [data]);

  useEffect(() => {
    if (agents.length && !agents.find((a) => a.identity.agent_id === agent)) {
      setAgent(agents[0].identity.agent_id);
    }
  }, [agents, agent]);

  const selectedCap = useMemo(
    () => caps.find((c) => c.capability_id === cap),
    [caps, cap],
  );

  const applyPreset = (p: Preset) => {
    setAgent(p.agent);
    setCap(p.cap);
    setAction(p.action);
    setInput(p.input);
    setApprovals(p.approvals ?? "");
  };

  return (
    <div className="mx-auto max-w-[1180px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>Live console</Eyebrow>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-white">
            Open a covenant
          </h1>
          <p className="mt-1 max-w-xl text-sm text-mute">
            Build a call, sign it with the agent&apos;s Ed25519 key, and watch all nine governed
            phases decide it — in real time, with the reasoning exposed.
          </p>
        </div>
        <LiveDot label="RUNTIME LIVE" />
      </div>

      {/* presets */}
      <div className="mt-6 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => applyPreset(p)}
            className="group rounded-lg border hairline bg-ink-800/50 px-3 py-2 text-left transition hover:border-signal/40 hover:bg-ink-700/60"
          >
            <div className="flex items-center gap-1.5 text-xs text-white/90">
              <Beaker size={12} className="text-signal" />
              {p.label}
            </div>
            <div className="font-mono text-[10px] text-mute">{p.desc}</div>
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[400px_1fr]">
        {/* builder */}
        <Panel className="p-5">
          <Eyebrow>Request builder</Eyebrow>
          <div className="mt-4 space-y-4">
            <Field label="Agent">
              <Select value={agent} onChange={setAgent}>
                {agents.map((a) => (
                  <option key={a.identity.agent_id} value={a.identity.agent_id}>
                    {a.identity.agent_name} · trust {a.trust?.score ?? "—"}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Capability">
              <Select value={cap} onChange={setCap}>
                {caps.map((c) => (
                  <option key={c.capability_id} value={c.capability_id}>
                    {c.capability_name} · {c.metadata.cost}
                    {c.metadata.requires_approval ? " · approval" : ""}
                  </option>
                ))}
              </Select>
              {selectedCap && (
                <div className="mt-1.5 font-mono text-[10px] text-mute">
                  {selectedCap.endpoint} · {selectedCap.metadata.category}
                </div>
              )}
            </Field>
            <Field label="Action">
              <input
                value={action}
                onChange={(e) => setAction(e.target.value)}
                className="w-full rounded-lg border hairline bg-ink-900/70 px-3 py-2 font-mono text-sm text-white outline-none focus:border-signal/50"
              />
            </Field>
            <Field label="Input (JSON)">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={4}
                spellCheck={false}
                className="scroll-thin w-full rounded-lg border hairline bg-ink-900/70 px-3 py-2 font-mono text-[12px] leading-relaxed text-signal/90 outline-none focus:border-signal/50"
              />
            </Field>
            <Field label="Approvals (comma-sep)">
              <input
                value={approvals}
                onChange={(e) => setApprovals(e.target.value)}
                placeholder="e.g. human:cfo"
                className="w-full rounded-lg border hairline bg-ink-900/70 px-3 py-2 font-mono text-sm text-white outline-none placeholder:text-mute/50 focus:border-signal/50"
              />
            </Field>

            <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 font-mono text-[11px] text-amber-200">
              {EXECUTION_MOVED}
            </div>

            <button
              type="button"
              disabled
              aria-disabled="true"
              title={EXECUTION_MOVED}
              className={cx(
                "relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg border border-signal/40 bg-signal/10 px-4 py-3 font-medium text-signal transition disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <Play size={16} />
              Open covenant · moved to CAPPO
            </button>
          </div>
        </Panel>

        {/* verdict + pipeline */}
        <div className="space-y-5">
          <Panel className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Eyebrow>Verdict</Eyebrow>
              {resp ? <Verdict status={resp.status} /> : <span className="font-mono text-[11px] text-mute">idle</span>}
            </div>
            {resp ? (
              <div className="mt-3 grid gap-x-8 gap-y-1 sm:grid-cols-2">
                <KeyVal k="connection" v={short(resp.connection_id, 8)} />
                <KeyVal k="evidence" v={resp.evidence_hash ? short(resp.evidence_hash, 8) : "—"} />
                <KeyVal k="trust Δ" v={`${resp.metadata.trust_delta >= 0 ? "+" : ""}${resp.metadata.trust_delta} → ${resp.metadata.new_trust_score}`} />
                <KeyVal k="audited" v={resp.metadata.audit_logged ? "yes" : "no"} />
                {resp.result && (
                  <KeyVal k="exec" v={`${resp.result.execution_time_ms.toFixed(1)}ms`} />
                )}
                {resp.error && (
                  <KeyVal k="error" v={<span className="text-rose-300">{resp.error.code} · {resp.error.message}</span>} />
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-mute">
                Verdicts, proof hashes and trust deltas are produced by CAPPO&apos;s governed /v1/exec
                boundary; this console no longer executes calls.
              </p>
            )}
          </Panel>

          <Panel className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <Eyebrow>Covenant trace · 9 phases</Eyebrow>
              <span className="font-mono text-[10px] text-mute">click a phase to inspect its decision</span>
            </div>
            <Pipeline trace={resp?.trace ?? null} runId={runId} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-mute">{label}</span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full appearance-none rounded-lg border hairline bg-ink-900/70 px-3 py-2 text-sm text-white outline-none focus:border-signal/50"
    >
      {children}
    </select>
  );
}

