"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Fingerprint, Radar, Search, Server } from "lucide-react";
import { Eyebrow, Json, Panel } from "@/components/ui";
import { useNetwork } from "@/components/useNetwork";
import { cx, timeAgo } from "@/components/util";
import { findEventHash, mcpCall, upstreamBody, type RpcExchange } from "@/lib/mcp/tryIt";
import type { NetworkSnapshot, SourceResult } from "@/lib/network/snapshot";

export type NetworkView = "overview" | "registry" | "agents" | "ledger" | "governance" | "safety" | "console";

const DEPENDENCY_LABEL: Record<string, string> = {
  cappo: "CAPPO · authority",
  pgl: "PGL · evidence ledger",
  lockerphycer: "Lockerphycer · identity",
};

/** The live-network block shown at the top of each console tab. */
export function NetworkSection({ view }: { view: NetworkView }) {
  const { network, failed } = useNetwork();

  if (failed && !network) {
    return <Notice tone="rose">The live network view could not be loaded from this server.</Notice>;
  }
  if (!network) {
    return <p className="mt-6 font-mono text-[11px] text-mute">Reading the Veklom network…</p>;
  }

  return (
    <section className="mt-6 space-y-4">
      <div className="flex items-center gap-2">
        <Radar size={14} className="text-signal" />
        <Eyebrow>Live network · checked {timeAgo(network.checked_at)}</Eyebrow>
      </div>
      {view === "overview" && <NetworkStrip network={network} />}
      {view === "registry" && (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
          <PackagesPanel source={network.packages} mode="catalog" />
          <ServicesPanel network={network} />
        </div>
      )}
      {view === "agents" && (
        <>
          <RegistryNotice network={network} subject="Agent identities" />
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
            <ServicesPanel network={network} title="Machine identities on the network" />
            <AuthorityKeysPanel network={network} />
          </div>
        </>
      )}
      {view === "ledger" && (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
          <ReceiptLookup />
          <DependenciesPanel network={network} only={["pgl", "cappo"]} />
        </div>
      )}
      {view === "governance" && (
        <>
          <RegistryNotice network={network} subject="Registry policies" />
          <PackagesPanel source={network.packages} mode="rules" />
        </>
      )}
      {view === "safety" && (
        <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
          <VnpPanel network={network} />
          <DependenciesPanel network={network} />
          <BlockedActionsPanel network={network} />
        </div>
      )}
      {view === "console" && <RegistryNotice network={network} subject="Signing agents" showConnect />}
    </section>
  );
}

function NetworkStrip({ network }: { network: NetworkSnapshot }) {
  const deps = Object.values(network.dependencies);
  const configured = deps.filter((d) => d.state !== "unconfigured");
  const healthy = deps.filter((d) => d.state === "healthy").length;
  const services = network.services.data ?? [];
  const online = services.filter((s) => !s.stale).length;
  const vnp = network.vnp.data;
  const items: Array<{ label: string; value: string; href: string; tone?: string }> = [
    { label: "capability packages", value: count(network.packages), href: "/registry", tone: "text-signal" },
    { label: "services online", value: network.services.state === "live" ? `${online}/${services.length}` : "—", href: "/registry" },
    { label: "dependencies healthy", value: `${healthy}/${configured.length}`, href: "/safety", tone: healthy === configured.length ? "text-signal" : "text-amber-300" },
    { label: "MCP tools", value: String(network.mcp_tools.length), href: "/connect" },
    { label: "VNP nodes", value: vnp && vnp.expected_nodes !== null ? `${vnp.active_nodes ?? 0}/${vnp.expected_nodes}` : "—", href: "/safety" },
    { label: "blocked actions", value: network.packages.data ? String(network.packages.data.reduce((n, p) => n + p.blocked.length, 0)) : "—", href: "/governance", tone: "text-rose-300" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((item) => (
        <Link key={item.label} href={item.href} className="group">
          <Panel className="px-4 py-3 transition group-hover:border-signal/30">
            <div className={cx("tnum font-display text-2xl font-semibold", item.tone ?? "text-white")}>{item.value}</div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-mute">{item.label}</div>
          </Panel>
        </Link>
      ))}
    </div>
  );
}

function count<T>(source: SourceResult<T[]>): string {
  return source.state === "live" && source.data ? String(source.data.length) : "—";
}

function PackagesPanel({ source, mode }: { source: NetworkSnapshot["packages"]; mode: "catalog" | "rules" }) {
  return (
    <Panel className="p-5">
      <Eyebrow>{mode === "catalog" ? "Capability packages · live from CAPPO" : "What CAPPO allows and blocks · per package"}</Eyebrow>
      <SourceGate source={source} name="CAPPO catalog">
        {(packages) => (
          <div className="mt-4 space-y-3">
            {packages.map((pkg) => (
              <div key={pkg.id} className="rounded-lg border hairline bg-ink-800/40 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-white">{pkg.title}</span>
                  <code className="font-mono text-[11px] text-mute">{pkg.id}</code>
                </div>
                {mode === "catalog" && pkg.purpose && <p className="mt-1.5 text-sm leading-relaxed text-white/70">{pkg.purpose}</p>}
                {mode === "rules" ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <RuleColumn label="May read" items={pkg.reads} tone="signal" />
                    <RuleColumn label="May write" items={pkg.writes} tone="signal" />
                    <RuleColumn label="Blocked" items={pkg.blocked} tone="rose" />
                    <div className="sm:col-span-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-mute">
                      {pkg.family && <span>family · {pkg.family}</span>}
                      {pkg.target_ref && <span>target · {pkg.target_ref}</span>}
                      <span>start claim · {pkg.requires_start_claim ? "required" : "not required"}</span>
                      {Object.keys(pkg.policy_defaults).length > 0 && <span>defaults · {JSON.stringify(pkg.policy_defaults)}</span>}
                    </div>
                  </div>
                ) : (
                  <ActionChips reads={[...pkg.reads, ...pkg.writes]} blocked={pkg.blocked} />
                )}
              </div>
            ))}
          </div>
        )}
      </SourceGate>
    </Panel>
  );
}

function RuleColumn({ label, items, tone }: { label: string; items: string[]; tone: "signal" | "rose" }) {
  return (
    <div className="rounded-md border hairline bg-ink-900/60 p-2.5">
      <div className="font-mono text-[10px] uppercase tracking-wider text-mute">{label}</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5 font-mono text-[10px]">
        {items.length === 0 && <span className="text-mute/70">none</span>}
        {items.map((a) => (
          <span key={a} className={cx("rounded border px-1.5 py-0.5", tone === "rose" ? "border-rose-500/30 bg-rose-500/10 text-rose-300 line-through" : "border-signal/30 bg-signal/10 text-signal")}>
            {a}
          </span>
        ))}
      </div>
    </div>
  );
}

function ActionChips({ reads, blocked }: { reads: string[]; blocked: string[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-[10px]">
      {reads.map((a) => (
        <span key={a} className="rounded border border-signal/30 bg-signal/10 px-1.5 py-0.5 text-signal">{a}</span>
      ))}
      {blocked.map((a) => (
        <span key={a} className="rounded border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-rose-300 line-through">{a}</span>
      ))}
    </div>
  );
}

function ServicesPanel({ network, title = "Registered services · heartbeats" }: { network: NetworkSnapshot; title?: string }) {
  return (
    <Panel className="p-5">
      <Eyebrow>{title}</Eyebrow>
      <SourceGate source={network.services} name="service registry">
        {(services) =>
          services.length === 0 ? (
            <p className="mt-4 text-sm text-mute">No service has registered with this node yet.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {services.map((svc) => (
                <div key={svc.service_name} className="rounded-lg border hairline bg-ink-800/40 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-sm text-white">
                      <Server size={13} className="text-mute" />
                      {svc.service_name}
                    </span>
                    <span className={cx("rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider", svc.stale ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-signal/30 bg-signal/10 text-signal")}>
                      {svc.stale ? "stale" : "online"}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-mute">
                    {svc.last_seen && <span>heartbeat {timeAgo(svc.last_seen)}</span>}
                    <span>{svc.capabilities.length} capabilit{svc.capabilities.length === 1 ? "y" : "ies"}</span>
                    <span>{svc.authenticated ? "authenticated registration" : "unauthenticated registration"}</span>
                    {svc.base_url && <span className="truncate">{svc.base_url}</span>}
                  </div>
                </div>
              ))}
            </div>
          )
        }
      </SourceGate>
    </Panel>
  );
}

function AuthorityKeysPanel({ network }: { network: NetworkSnapshot }) {
  return (
    <Panel className="p-5">
      <div className="flex items-center gap-2">
        <Fingerprint size={14} className="text-violet" />
        <Eyebrow>CAPPO issuer keys</Eyebrow>
      </div>
      <p className="mt-2 text-xs text-mute">The keys CAPPO signs capability beacons with. Anyone can fetch and verify them.</p>
      <SourceGate source={network.beacon_keys} name="CAPPO key set">
        {(keys) => (
          <div className="mt-3 space-y-2 font-mono text-[11px]">
            {keys.issuer && <div className="text-white/80">issuer · {keys.issuer}</div>}
            {keys.keys.length === 0 && <div className="text-mute">No keys published.</div>}
            {keys.keys.map((k) => (
              <div key={k.kid} className="rounded-md border hairline bg-ink-900/60 px-3 py-2 text-white/80">
                kid {k.kid} · {k.algorithm ?? "?"}{k.curve ? ` · ${k.curve}` : ""}
              </div>
            ))}
          </div>
        )}
      </SourceGate>
    </Panel>
  );
}

function DependenciesPanel({ network, only }: { network: NetworkSnapshot; only?: string[] }) {
  const entries = Object.entries(network.dependencies).filter(([name]) => !only || only.includes(name));
  return (
    <Panel className="p-5">
      <Eyebrow>Connections · probed now</Eyebrow>
      <div className="mt-4 space-y-2">
        {entries.map(([name, dep]) => (
          <div key={name} className="flex items-center justify-between rounded-lg border hairline bg-ink-800/40 px-3 py-2.5">
            <span className="text-sm text-white/85">{DEPENDENCY_LABEL[name] ?? name}</span>
            <span className="flex items-center gap-3 font-mono text-[11px]">
              {dep.latency_ms !== null && <span className="text-mute">{dep.latency_ms} ms</span>}
              <span className={cx("rounded border px-2 py-0.5 uppercase tracking-wider", dep.state === "healthy" ? "border-signal/30 bg-signal/10 text-signal" : dep.state === "unconfigured" ? "hairline bg-white/5 text-mute" : "border-rose-500/30 bg-rose-500/10 text-rose-300")}>
                {dep.state}
              </span>
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-mute">Reachability only. It does not prove any action happened.</p>
    </Panel>
  );
}

function VnpPanel({ network }: { network: NetworkSnapshot }) {
  return (
    <Panel className="p-5">
      <Eyebrow>VNP · network measurement</Eyebrow>
      <SourceGate source={network.vnp} name="VNP metrics">
        {(vnp) => (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/85">Proof state</span>
              <span className={cx("rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider", vnp.proof_state === "proven" ? "border-signal/30 bg-signal/10 text-signal" : "border-amber-500/30 bg-amber-500/10 text-amber-300")}>
                {vnp.proof_state ?? "unknown"}
              </span>
            </div>
            {vnp.proof_signal && <p className="text-xs text-mute">{vnp.proof_signal}</p>}
            <Stat k="Active nodes" v={vnp.expected_nodes !== null ? `${vnp.active_nodes ?? 0} / ${vnp.expected_nodes}` : "—"} />
            <Stat k="Probes recorded" v={vnp.probes_recorded ?? "—"} />
            <Stat k="Active validators" v={vnp.active_validators ?? "—"} />
            <Stat k="Avg composite score" v={vnp.avg_composite_score ?? "—"} />
            {vnp.methodology && <p className="pt-1 font-mono text-[10px] text-mute">{vnp.methodology}</p>}
          </div>
        )}
      </SourceGate>
    </Panel>
  );
}

function BlockedActionsPanel({ network }: { network: NetworkSnapshot }) {
  return (
    <Panel className="p-5">
      <Eyebrow>Blocked across the network</Eyebrow>
      <p className="mt-2 text-xs text-mute">Actions CAPPO refuses for every mount of these packages.</p>
      <SourceGate source={network.packages} name="CAPPO catalog">
        {(packages) => {
          const rows = packages.filter((p) => p.blocked.length > 0);
          return rows.length === 0 ? (
            <p className="mt-3 text-sm text-mute">No package blocks an action.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {rows.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border hairline bg-ink-800/40 px-3 py-2">
                  <span className="min-w-0 truncate text-sm text-white/85">{p.title}</span>
                  <span className="flex shrink-0 flex-wrap justify-end gap-1 font-mono text-[10px]">
                    {p.blocked.map((a) => (
                      <span key={a} className="rounded border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-rose-300 line-through">{a}</span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          );
        }}
      </SourceGate>
    </Panel>
  );
}

function ReceiptLookup() {
  const [hash, setHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RpcExchange | null>(null);
  const valid = /^[a-f0-9]{64}$/.test(hash.trim());

  const lookup = async () => {
    setBusy(true);
    setResult(await mcpCall("tools/call", { name: "veklom_verify_evidence", arguments: { event_hash: hash.trim() } }));
    setBusy(false);
  };
  const body = result ? upstreamBody(result.payload) : undefined;
  const found = body?.found_in_ledger === true && findEventHash(body) === hash.trim();

  return (
    <Panel className="p-5">
      <Eyebrow>Verify any receipt in the PGL ledger</Eyebrow>
      <p className="mt-2 text-sm text-mute">
        Paste a <code className="font-mono text-white/80">pgl_event_hash</code> returned by a governed action. The lookup goes to the
        ledger itself through the public <code className="font-mono text-white/80">veklom_verify_evidence</code> tool.
      </p>
      <div className="mt-4 flex gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border hairline bg-ink-900/70 px-3 py-2 focus-within:border-signal/40">
          <Search size={13} className="shrink-0 text-mute" />
          <input
            value={hash}
            onChange={(e) => setHash(e.target.value.toLowerCase())}
            placeholder="64-character hex event hash"
            className="w-full min-w-0 bg-transparent font-mono text-sm text-white outline-none placeholder:text-mute/60"
          />
        </label>
        <button
          onClick={() => void lookup()}
          disabled={!valid || busy}
          className={cx("rounded-lg border px-4 font-mono text-[11px] uppercase tracking-wider", valid && !busy ? "border-signal/40 bg-signal/10 text-signal hover:bg-signal/20" : "cursor-not-allowed hairline text-mute/60")}
        >
          {busy ? "…" : "Verify"}
        </button>
      </div>
      {result && (
        <div className="mt-4 space-y-2">
          <span className={cx("inline-block rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-wider", found ? "border-signal/30 bg-signal/10 text-signal" : "border-rose-500/30 bg-rose-500/10 text-rose-300")}>
            {found ? "found in ledger" : String(body?.error ?? "not found")}
          </span>
          <Json data={result.payload} />
        </div>
      )}
      <p className="mt-4 text-xs text-mute">
        No receipt yet? <Link href="/connect" className="text-signal hover:underline">Run one governed action</Link> and verify the hash it returns.
      </p>
    </Panel>
  );
}

function RegistryNotice({ network, subject, showConnect }: { network: NetworkSnapshot; subject: string; showConnect?: boolean }) {
  const registry = network.registry;
  if (registry?.state === "ready") return null;
  return (
    <Notice tone="amber">
      <span className="font-medium text-amber-100">{subject} come from the configured registry, which is not loaded</span>
      {registry ? <>: {registry.detail}.</> : "."} The network data on this page is live.
      {showConnect && (
        <>
          {" "}
          Meanwhile, agents act through the MCP endpoint:{" "}
          <Link href="/connect" className="inline-flex items-center gap-1 text-signal hover:underline">
            connect an agent <ArrowRight size={12} />
          </Link>
        </>
      )}
    </Notice>
  );
}

function Notice({ tone, children }: { tone: "amber" | "rose"; children: React.ReactNode }) {
  return (
    <div className={cx("mt-6 flex gap-3 rounded-lg border px-4 py-3 text-sm", tone === "amber" ? "border-amber-500/30 bg-amber-500/10 text-amber-200" : "border-rose-500/30 bg-rose-500/10 text-rose-200")}>
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

function SourceGate<T>({ source, name, children }: { source: SourceResult<T>; name: string; children: (data: T) => React.ReactNode }) {
  if (source.state === "live" && source.data !== undefined) return <>{children(source.data)}</>;
  return (
    <p className="mt-4 text-sm text-mute">
      {source.state === "unconfigured" ? `${name} is not configured on this node.` : `${name} unavailable (${source.error ?? "unknown error"}).`}
    </p>
  );
}

function Stat({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-sm text-white/70">{k}</span>
      <span className="tnum font-mono text-sm text-white">{v}</span>
    </div>
  );
}
