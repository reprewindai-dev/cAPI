"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import {
  Radio,
  TerminalSquare,
  Boxes,
  Bot,
  ScrollText,
  Scale,
  ShieldAlert,
  FlaskConical,
  Clock3,
} from "lucide-react";
import { BrandMark } from "./BrandMark";
import { BRAND } from "@/lib/covenant/brand";
import { cx } from "./util";
import { useLive } from "./useLive";
import { LiveDot } from "./ui";

const NAV = [
  { href: "/", label: "Overview", icon: Radio, status: "Live" },
  { href: "/console", label: "Console", icon: TerminalSquare, status: "Gate" },
  { href: "/registry", label: "Registry", icon: Boxes, status: "Mesh" },
  { href: "/agents", label: "Agents", icon: Bot, status: "Trust" },
  { href: "/ledger", label: "Ledger", icon: ScrollText, status: "Proof" },
  { href: "/governance", label: "Governance", icon: Scale, status: "Rules" },
  { href: "/safety", label: "Safety", icon: ShieldAlert, status: "Guard" },
  { href: "/testbed", label: "Test Bed", icon: FlaskConical, status: "MCP/API" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data } = useLive();
  const m = data?.metrics;
  const [clock, setClock] = React.useState("");

  React.useEffect(() => {
    const update = () => setClock(new Date().toISOString().replace("T", " ").slice(0, 19) + "Z");
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen bg-[#0B0C0E] text-[#D1D5DB]">
      {/* Left rail */}
      <aside className="sticky top-0 hidden h-screen w-[256px] shrink-0 flex-col border-r border-[#23272E] bg-[#0B0C0E] px-3 py-4 lg:flex">
        <Link href="/" className="flex items-center gap-3 px-2">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-blue-500 p-1 shadow-sm">
            <BrandMark size={22} />
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <div className="font-mono text-sm font-bold tracking-tight text-white">VEKLOM</div>
              <span className="rounded border border-blue-900/50 bg-blue-900/30 px-1.5 py-0.5 font-mono text-[8px] font-semibold tracking-widest text-blue-400">
                COGNITIVE_SHIELD
              </span>
            </div>
            <div className="font-mono text-[9px] uppercase tracking-wider text-gray-500">
              {BRAND.protocol} v{BRAND.version}
            </div>
          </div>
        </Link>

        <div className="mt-8 px-3 font-mono text-[10px] font-bold uppercase tracking-widest text-gray-500">
          Workspace
        </div>
        <nav className="mt-2 flex flex-col gap-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cx(
                  "group relative flex items-center gap-2 rounded-md border px-3 py-2 transition",
                  active ? "border-[#23272E] bg-[#1A1D23] text-white" : "border-transparent text-gray-400 hover:bg-[#15181E] hover:text-white",
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-blue-400" />
                )}
                <Icon size={15} className={active ? "text-blue-400" : "text-gray-500 group-hover:text-gray-300"} />
                <span className="flex-1 text-sm">{item.label}</span>
                <span className="rounded border border-[#23272E] bg-[#0B0C0E] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-gray-500">
                  {item.status}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-lg border border-[#23272E] bg-[#15181E] p-3">
          <div className="flex items-center justify-between">
            <LiveDot label={data ? "LIVE" : "NEEDS PROOF"} />
            <span className="font-mono text-[10px] text-gray-500">/api/state</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[11px]">
            <Stat label="covenants" value={m?.total ?? "—"} />
            <Stat label="authz %" value={m ? `${m.authorized_rate}` : "—"} />
            <Stat label="agents" value={m?.agents ?? "—"} />
            <Stat label="quarantine" value={m?.quarantine_open ?? "—"} />
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile / top bar */}
        <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-[#23272E] bg-[#0B0C0E]/95 px-5 py-3 backdrop-blur">
          <Link href="/" className="flex items-center gap-2 lg:hidden">
            <BrandMark size={24} />
            <span className="font-mono text-sm font-bold text-white">VEKLOM</span>
          </Link>
          <div className="hidden items-center gap-2 font-mono text-[11px] text-mute lg:flex">
            <span className="text-gray-400">{BRAND.tagline}</span>
          </div>
          <div className="ml-auto flex items-center gap-5 font-mono text-[11px] text-mute">
            <span className="hidden items-center gap-1.5 text-gray-500 md:inline-flex"><Clock3 size={12} className="text-blue-400" />{clock || "…"}</span>
            <span className={cx("hidden items-center gap-1.5 rounded border px-2 py-1 text-[9px] uppercase tracking-wider sm:inline-flex", data ? "border-emerald-900/50 bg-emerald-950/20 text-emerald-400" : "border-amber-900/50 bg-amber-950/20 text-amber-300")}>
              <span className={cx("h-1.5 w-1.5 rounded-full", data ? "animate-pulse bg-emerald-400" : "bg-amber-300")} />
              Policy Engine {data ? "active" : "needs proof"}
            </span>
            <Ticker label="authorized" value={m?.authorized} tone="text-signal" />
            <Ticker label="denied" value={m?.denied} tone="text-rose-300" />
            <Ticker label="quarantined" value={m?.quarantined} tone="text-amber-300" />
            <Ticker label="anomalies" value={m?.anomalies} tone="text-orange-400" />
          </div>
        </header>

        {/* Mobile nav */}
        <div className="scroll-thin flex gap-2 overflow-x-auto border-b border-[#23272E] px-4 py-2 lg:hidden">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cx(
                  "whitespace-nowrap rounded-md px-3 py-1.5 text-xs",
                  active ? "bg-[#1A1D23] text-white" : "text-gray-400",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <main className="scroll-thin flex-1 overflow-x-hidden px-5 py-6 lg:px-10 lg:py-9">
          {children}
        </main>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md bg-white/[0.03] px-2 py-1.5">
      <div className="tnum text-sm text-white">{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-mute">{label}</div>
    </div>
  );
}

function Ticker({ label, value, tone }: { label: string; value: number | undefined; tone: string }) {
  return (
    <span className="hidden items-center gap-1.5 sm:inline-flex">
      <span className={cx("tnum text-sm", tone)}>{value ?? "—"}</span>
      <span className="uppercase tracking-wider text-mute/70">{label}</span>
    </span>
  );
}
