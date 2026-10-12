"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Beaker, ExternalLink, KeyRound, Play, RefreshCw } from "lucide-react";
import { Eyebrow, Json, LiveDot, Panel } from "@/components/ui";
import { useNetwork } from "@/components/useNetwork";
import { cx } from "@/components/util";
import { initialStages, runGovernedCall, type GovernedCallResult, type Stage } from "@/lib/mcp/governedCall";
import { getSessionCredentials, setSessionCredentials, workspaceFromToken } from "@/lib/mcp/tryIt";
import type { CapabilityPackageSummary } from "@/lib/network/snapshot";

interface Preset {
  label: string;
  desc: string;
  pkg: string;
  action: string;
  resource: string;
  args?: string;
  mountScope?: { reads: string[]; writes: string[] };
}

// Each preset is a real call against a package in CAPPO's live catalog.
const PRESETS: Preset[] = [
  { label: "Clean increment", desc: "in scope · expect allow", pkg: "veklom.governed-counter@v1", action: "counter.increment", resource: "counter" },
  { label: "Read the counter", desc: "target's own state", pkg: "veklom.governed-counter@v1", action: "counter.read", resource: "counter" },
  { label: "Blocked reset", desc: "package blocks it · expect deny", pkg: "veklom.governed-counter@v1", action: "counter.reset", resource: "counter" },
  {
    label: "Out-of-scope write",
    desc: "read-only mount · expect deny",
    pkg: "veklom.governed-counter@v1",
    action: "counter.increment",
    resource: "counter",
    mountScope: { reads: ["counter.read"], writes: [] },
  },
  { label: "Protected record delete", desc: "immutable guardrail · expect deny", pkg: "arena.dataset@v1", action: "record.delete", resource: "record-1" },
];

const STATUS_STYLE: Record<Stage["status"], { dot: string; text: string; label: string }> = {
  pending: { dot: "bg-white/15", text: "text-mute", label: "waiting" },
  running: { dot: "bg-signal animate-pulse", text: "text-signal", label: "running" },
  pass: { dot: "bg-signal", text: "text-signal", label: "pass" },
  fail: { dot: "bg-rose-500", text: "text-rose-300", label: "refused" },
  skipped: { dot: "bg-white/30", text: "text-mute", label: "skipped" },
};

export default function ConsolePage() {
  const { network } = useNetwork();
  const packages = useMemo(() => network?.packages.data ?? [], [network]);
  const initial = getSessionCredentials();
  const [credential, setCredential] = useState(initial.credential);
  const [workspace, setWorkspace] = useState(initial.workspace);
  const [project, setProject] = useState(initial.project);
  const [pkgId, setPkgId] = useState(PRESETS[0].pkg);
  const [action, setAction] = useState(PRESETS[0].action);
  const [resource, setResource] = useState(PRESETS[0].resource);
  const [args, setArgs] = useState("{}");
  const [mountScope, setMountScope] = useState<Preset["mountScope"]>(undefined);
  const [stages, setStages] = useState<Stage[]>(initialStages());
  const [result, setResult] = useState<GovernedCallResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pkg: CapabilityPackageSummary | undefined = packages.find((p) => p.id === pkgId);
  const actions = pkg ? [...pkg.reads, ...pkg.writes, ...pkg.blocked] : [action];

  const applyPreset = (p: Preset) => {
    setPkgId(p.pkg);
    setAction(p.action);
    setResource(p.resource);
    setArgs(p.args ?? "{}");
    setMountScope(p.mountScope);
    setResult(null);
    setStages(initialStages());
  };

  const choosePackage = (id: string) => {
    const next = packages.find((p) => p.id === id);
    setPkgId(id);
    setAction(next ? [...next.writes, ...next.reads, ...next.blocked][0] ?? "" : "");
    setMountScope(undefined);
  };

  const run = async () => {
    setError(null);
    if (!pkg) {
      setError("That package is not in CAPPO's live catalog right now.");
      return;
    }
    let parsed: Record<string, unknown>;
    try {
      const value: unknown = JSON.parse(args || "{}");
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
      parsed = value as Record<string, unknown>;
    } catch {
      setError("Arguments must be a JSON object.");
      return;
    }
    setBusy(true);
    setResult(null);
    const outcome = await runGovernedCall(
      {
        pkg,
        action,
        resource: resource.trim(),
        targetRef: pkg.target_ref ?? pkg.id,
        args: parsed,
        workspace: workspace.trim(),
        project: project.trim(),
        mountScope,
      },
      credential,
      setStages,
    );
    setStages(outcome.stages);
    setResult(outcome);
    setBusy(false);
  };

  const ready = credential.trim().length >= 8 && workspace.trim() && project.trim() && pkg && action && resource.trim();
  const scope = mountScope ?? (pkg ? { reads: pkg.reads, writes: pkg.writes } : { reads: [], writes: [] });

  return (
    <div className="mx-auto max-w-[1180px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>Live console · real calls through /mcp</Eyebrow>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-white">Open a covenant</h1>
          <p className="mt-1 max-w-2xl text-sm text-mute">
            Pick a capability package from CAPPO&apos;s live catalog and an action. CAPPO mounts it, decides the action and anchors a receipt
            in the PGL ledger. Every step below is a real call, with the raw exchange one click away.
          </p>
        </div>
        <LiveDot label={network?.packages.state === "live" ? "CAPPO LIVE" : "CAPPO …"} />
      </div>

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

      <div className="mt-5 grid gap-5 lg:grid-cols-[400px_1fr] [&>*]:min-w-0">
        <Panel className="p-5">
          <Eyebrow>Request builder</Eyebrow>
          <div className="mt-4 space-y-3">
            <Field label="Veklom credential" icon={<KeyRound size={12} />}>
              <input
                type="password"
                autoComplete="off"
                value={credential}
                onChange={(e) => {
                  setCredential(e.target.value);
                  setSessionCredentials({ credential: e.target.value });
                  const hint = workspaceFromToken(e.target.value);
                  if (hint && !workspace) {
                    setWorkspace(hint);
                    setSessionCredentials({ workspace: hint });
                  }
                }}
                placeholder="Session or machine token"
                className="input"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Workspace">
                <input
                  value={workspace}
                  onChange={(e) => {
                    setWorkspace(e.target.value);
                    setSessionCredentials({ workspace: e.target.value });
                  }}
                  placeholder="your workspace ID"
                  className="input"
                />
              </Field>
              <Field label="Project">
                <input
                  value={project}
                  onChange={(e) => {
                    setProject(e.target.value);
                    setSessionCredentials({ project: e.target.value });
                  }}
                  className="input"
                />
              </Field>
            </div>
            <Field label="Capability package">
              <select value={pkgId} onChange={(e) => choosePackage(e.target.value)} className="input">
                {!pkg && <option value={pkgId}>{pkgId} (loading catalog…)</option>}
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} · {p.id}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Action">
              <select
                value={action}
                onChange={(e) => {
                  setAction(e.target.value);
                  setMountScope(undefined);
                }}
                className="input"
              >
                {actions.map((a) => (
                  <option key={a} value={a}>
                    {a}
                    {pkg?.blocked.includes(a) ? " · blocked by package" : pkg?.reads.includes(a) ? " · read" : " · write"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Resource">
              <input value={resource} onChange={(e) => setResource(e.target.value)} className="input" />
            </Field>
            <Field label="Arguments (JSON)">
              <textarea value={args} onChange={(e) => setArgs(e.target.value)} rows={3} className="input resize-y" spellCheck={false} />
            </Field>
            <div className="rounded-lg border hairline bg-ink-900/60 px-3 py-2 font-mono text-[10px] leading-relaxed text-mute">
              target · {pkg?.target_ref ?? "—"}
              <br />
              mount scope · reads [{scope.reads.join(", ")}] writes [{scope.writes.join(", ")}]
            </div>
            {error && <p className="text-xs text-rose-300">{error}</p>}
            {!credential && (
              <p className="text-xs text-mute">
                Need a credential?{" "}
                <a href="https://veklom.com/signup" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-signal hover:underline">
                  Sign up at veklom.com <ExternalLink size={11} />
                </a>
              </p>
            )}
            <button
              onClick={() => void run()}
              disabled={!ready || busy}
              className={cx(
                "flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-3 font-medium transition",
                ready && !busy ? "border-signal/50 bg-signal/15 text-signal hover:bg-signal/25" : "cursor-not-allowed hairline text-mute/60",
              )}
            >
              {busy ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
              {busy ? "CAPPO is deciding…" : "Open covenant"}
            </button>
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel className="p-5">
            <div className="flex items-center justify-between">
              <Eyebrow>Verdict</Eyebrow>
              <span className="font-mono text-[11px] text-mute">{busy ? "running" : result ? "decided by CAPPO" : "idle"}</span>
            </div>
            {!result && !busy && <p className="mt-3 text-sm text-mute">Choose a preset or build a call, then open the covenant.</p>}
            {busy && <p className="mt-3 text-sm text-signal">Calls are in flight to CAPPO through /mcp…</p>}
            {result && (
              <div className="mt-3 space-y-2">
                <span
                  className={cx(
                    "inline-flex items-center gap-2 rounded-md border px-2.5 py-1 font-mono text-[11px] tracking-[0.18em]",
                    result.verdict === "allow" ? "border-signal/30 bg-signal/10 text-signal" : result.verdict === "deny" ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : "border-white/15 bg-white/5 text-mute",
                  )}
                >
                  {result.verdict === "allow" ? "AUTHORIZED" : result.verdict === "deny" ? "DENIED" : "NOT RUN"}
                </span>
                <p className="text-sm text-white/80">{result.reason}</p>
                {result.receipt && (
                  <p className="break-all font-mono text-[11px] text-mute">
                    receipt · {result.receipt}{" "}
                    <Link href="/ledger" className="text-signal hover:underline">
                      verify again in Ledger
                    </Link>
                  </p>
                )}
              </div>
            )}
          </Panel>

          <Panel className="p-5">
            <div className="flex items-center justify-between">
              <Eyebrow>Covenant trace · {stages.length} real steps</Eyebrow>
              <span className="font-mono text-[10px] text-mute">click a step to see the exchange</span>
            </div>
            <ol className="mt-4 space-y-2">
              {stages.map((stage, i) => {
                const style = STATUS_STYLE[stage.status];
                return (
                  <li key={stage.key} className="rounded-lg border hairline bg-ink-800/40">
                    <details>
                      <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5">
                        <span className="font-mono text-[10px] text-mute">{i + 1}</span>
                        <span className={cx("h-2 w-2 shrink-0 rounded-full", style.dot)} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-white/90">{stage.title}</span>
                          <span className="block truncate text-xs text-mute">{stage.detail || style.label}</span>
                        </span>
                        <span className={cx("font-mono text-[10px] uppercase tracking-wider", style.text)}>{style.label}</span>
                      </summary>
                      {stage.exchange && (
                        <div className="grid gap-2 px-3 pb-3 lg:grid-cols-2">
                          <Json data={stage.exchange.request} />
                          <Json data={stage.exchange.payload} />
                        </div>
                      )}
                      {!stage.exchange && stage.detail && <p className="break-all px-3 pb-3 font-mono text-[11px] text-mute">{stage.detail}</p>}
                    </details>
                  </li>
                );
              })}
            </ol>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-mute">
        {icon}
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
