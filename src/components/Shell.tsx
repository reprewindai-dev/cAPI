"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Radio,
  TerminalSquare,
  Boxes,
  Bot,
  ScrollText,
  Scale,
  ShieldAlert,
} from "lucide-react";
import { BrandMark } from "./BrandMark";
import { BRAND } from "@/lib/covenant/brand";
import { cx } from "./util";
import { useLive } from "./useLive";
import { LiveDot } from "./ui";

const NAV = [
  { href: "/", label: "Overview", icon: Radio, hint: "signal" },
  { href: "/console", label: "Console", icon: TerminalSquare, hint: "open a covenant" },
  { href: "/registry", label: "Registry", icon: Boxes, hint: "capabilities" },
  { href: "/agents", label: "Agents", icon: Bot, hint: "trust + risk" },
  { href: "/ledger", label: "Ledger", icon: ScrollText, hint: "evidence chain" },
  { href: "/governance", label: "Governance", icon: Scale, hint: "policy composition" },
  { href: "/safety", label: "Safety", icon: ShieldAlert, hint: "anomalies + quorum" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data } = useLive();
  const m = data?.metrics;

  return (
    <div className="flex min-h-screen">
      {/* Left rail */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r hairline bg-ink-900/40 px-4 py-5 lg:flex">
        <Link href="/" className="flex items-center gap-3 px-2">
          <BrandMark size={30} />
          <div className="leading-tight">
            <div className="font-display text-[17px] font-semibold tracking-tight text-white">
              {BRAND.name}
            </div>
            <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-mute">
              {BRAND.protocol} · v{BRAND.version}
            </div>
          </div>
        </Link>

        <nav className="mt-8 flex flex-col gap-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cx(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 transition",
                  active ? "bg-white/[0.06] text-white" : "text-mute hover:bg-white/[0.03] hover:text-white/80",
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-signal shadow-glow" />
                )}
                <Icon size={16} className={active ? "text-signal" : "text-mute group-hover:text-white/70"} />
                <span className="flex-1 text-sm">{item.label}</span>
                <span className="font-mono text-[9px] uppercase tracking-wider text-mute/60">
                  {item.hint}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-xl border hairline bg-ink-800/60 p-3">
          <div className="flex items-center justify-between">
            <LiveDot />
            <span className="font-mono text-[10px] text-mute">runtime</span>
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
        <header className="sticky top-0 z-20 flex items-center gap-4 border-b hairline bg-ink-900/70 px-5 py-3 backdrop-blur">
          <Link href="/" className="flex items-center gap-2 lg:hidden">
            <BrandMark size={24} />
            <span className="font-display text-sm font-semibold text-white">{BRAND.name}</span>
          </Link>
          <div className="hidden items-center gap-2 font-mono text-[11px] text-mute lg:flex">
            <span className="text-white/70">{BRAND.tagline}</span>
          </div>
          <div className="ml-auto flex items-center gap-5 font-mono text-[11px] text-mute">
            <Ticker label="authorized" value={m?.authorized} tone="text-signal" />
            <Ticker label="denied" value={m?.denied} tone="text-rose-300" />
            <Ticker label="quarantined" value={m?.quarantined} tone="text-amber-300" />
            <Ticker label="anomalies" value={m?.anomalies} tone="text-orange-400" />
          </div>
        </header>

        {/* Mobile nav */}
        <div className="scroll-thin flex gap-2 overflow-x-auto border-b hairline px-4 py-2 lg:hidden">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cx(
                  "whitespace-nowrap rounded-md px-3 py-1.5 text-xs",
                  active ? "bg-white/10 text-white" : "text-mute",
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
