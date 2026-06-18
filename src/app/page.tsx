"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowRight, Fingerprint, ScrollText, Brain, Scale } from "lucide-react";
import { BRAND } from "@/lib/covenant/brand";
import { useLive } from "@/components/useLive";
import { Eyebrow, LiveDot, Panel } from "@/components/ui";
import { BrandMark } from "@/components/BrandMark";
import { cx } from "@/components/util";

const PHASES = [
  "Identity",
  "Policy",
  "Safety",
  "Cost",
  "Approval",
  "Execution",
  "Evidence",
  "Audit",
  "Response",
];

const UNLOCKS = [
  { icon: Fingerprint, title: "Self-describing", body: "Every actor and capability carries verifiable identity. Agents ask “what can I do, right now?” and get a policy-true answer." },
  { icon: Scale, title: "Self-authorizing", body: "System, owner, and runtime policies compose at call time. Conflicts resolve deterministically before a single side effect." },
  { icon: ScrollText, title: "Self-proving", body: "Each call seals a hash-chained evidence record. The proof is the product — replayable, tamper-evident, audit-ready." },
  { icon: Brain, title: "Self-improving", body: "Trust, behavioral baselines, cost attribution, and risk scoring update on every call. The connection learns." },
];

const VERSUS = [
  { k: "vs MCP", v: "MCP discovers tools. Covenant discovers, authorizes, executes — and proves it." },
  { k: "vs REST API", v: "An API is a stateless call. A covenant is a governed relationship with trust + evidence." },
  { k: "vs API Gateway", v: "Gateways do auth + rate limits. Covenant adds policy composition, safety, and proof." },
  { k: "vs Service Mesh", v: "A mesh moves bytes with mTLS. Covenant moves capability with accountability." },
];

export default function Overview() {
  const { data } = useLive();
  const m = data?.metrics;

  return (
    <div className="mx-auto max-w-[1180px]">
      {/* hero */}
      <section className="relative overflow-hidden rounded-2xl border hairline bg-ink-800/30 px-6 py-12 sm:px-12 sm:py-16">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-violet/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -left-10 h-72 w-72 rounded-full bg-signal/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <BrandMark size={34} />
            <span className="font-mono text-[10px] uppercase tracking-[0.34em] text-mute">
              {BRAND.protocol} · v{BRAND.version}
            </span>
            <span className="ml-2">
              <LiveDot />
            </span>
          </div>
          <h1 className="mt-7 max-w-3xl font-display text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl">
            The connection is the <span className="text-signal text-glow">asset</span>.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/70 sm:text-lg">
            {BRAND.subtagline}
          </p>

          {/* covenant diagram */}
          <div className="mt-9 flex flex-wrap items-center gap-3 font-mono text-xs">
            <span className="chip bg-ink-900/70 px-3 py-2 text-white/80">agent · any model</span>
            <Arrow />
            <span className="rounded-lg border border-signal/40 bg-signal/10 px-3 py-2 text-signal">
              ◆ covenant · 9 governed phases
            </span>
            <Arrow />
            <span className="chip bg-ink-900/70 px-3 py-2 text-white/80">capability · tool / api / agent</span>
            <Arrow />
            <span className="chip border-violet/40 bg-violet/10 px-3 py-2 text-violet">⛓ sealed proof → {BRAND.ledgerName}</span>
          </div>

          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/console"
              className="group inline-flex items-center gap-2 rounded-lg border border-signal/50 bg-signal/15 px-5 py-3 font-medium text-signal transition hover:bg-signal/25"
            >
              Open the live console
              <ArrowRight size={16} className="transition group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/ledger"
              className="inline-flex items-center gap-2 rounded-lg border hairline bg-ink-800/60 px-5 py-3 text-white/80 transition hover:bg-ink-700"
            >
              Walk the evidence chain
            </Link>
          </div>
        </div>
      </section>

      {/* live metrics */}
      <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <Metric label="covenants" value={m?.total} />
        <Metric label="authorized" value={m?.authorized} tone="text-signal" />
        <Metric label="denied" value={m?.denied} tone="text-rose-300" />
        <Metric label="quarantined" value={m?.quarantined} tone="text-amber-300" />
        <Metric label="agents" value={m?.agents} />
        <Metric label="capabilities" value={m?.capabilities} />
      </section>

      {/* the unified call */}
      <section className="mt-10">
        <Eyebrow>The unified call</Eyebrow>
        <h2 className="mt-2 max-w-2xl font-display text-2xl font-semibold tracking-tight text-white">
          One call. Nine governed phases. A proof at the end.
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-mute">
          MCP asks what an agent can do. An API does it. Neither makes the call accountable.
          {" "}{BRAND.name} fuses both into a single governed connection that decides, executes, and proves — every time.
        </p>
        <div className="mt-5 flex flex-wrap items-stretch gap-2">
          {PHASES.map((p, i) => (
            <div
              key={p}
              className="flex items-center gap-2 rounded-lg border hairline bg-ink-800/50 px-3 py-2"
            >
              <span className="font-mono text-[10px] text-signal">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-sm text-white/80">{p}</span>
            </div>
          ))}
        </div>
      </section>

      {/* what it unlocks */}
      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        {UNLOCKS.map((u) => {
          const Icon = u.icon;
          return (
            <Panel key={u.title} className="p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-signal/30 bg-signal/10 text-signal">
                  <Icon size={16} />
                </span>
                <h3 className="font-display text-lg font-semibold text-white">{u.title}</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-mute">{u.body}</p>
            </Panel>
          );
        })}
      </section>

      {/* versus */}
      <section className="mt-10">
        <Eyebrow>Why it&apos;s a new category</Eyebrow>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {VERSUS.map((row) => (
            <div key={row.k} className="flex gap-4 rounded-lg border hairline bg-ink-800/40 p-4">
              <span className="w-28 shrink-0 font-mono text-xs uppercase tracking-wider text-signal">{row.k}</span>
              <span className="text-sm text-white/80">{row.v}</span>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-12 flex items-center justify-between border-t hairline py-6 font-mono text-[11px] text-mute">
        <span>{BRAND.name} · {BRAND.protocol}</span>
        <span>part of the {BRAND.ecosystem} ecosystem</span>
      </footer>
    </div>
  );
}

function Arrow() {
  return <span className="text-mute/50">→</span>;
}

function Metric({ label, value, tone }: { label: string; value: number | undefined; tone?: string }) {
  return (
    <Panel className="px-4 py-3">
      <div className={cx("tnum font-display text-2xl font-semibold", tone ?? "text-white")}>
        {value ?? "—"}
      </div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-mute">{label}</div>
    </Panel>
  );
}
