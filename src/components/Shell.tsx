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
  UserCheck,
  Clock as ClockIcon,
  Activity,
  Zap,
  Signature
} from "lucide-react";
import { cx } from "./util";
import { useLive } from "./useLive";
import { useState, useEffect } from "react";

const NAV = [
  { href: "/", label: "Overview", icon: Radio, status: "Live" },
  { href: "/console", label: "Console", icon: TerminalSquare, status: "Gate" },
  { href: "/registry", label: "Registry", icon: Boxes, status: "Mesh" },
  { href: "/agents", label: "Agents", icon: Bot, status: "Trust" },
  { href: "/ledger", label: "Ledger", icon: ScrollText, status: "Proof" },
  { href: "/governance", label: "Governance", icon: Scale, status: "Rules" },
  { href: "/safety", label: "Safety", icon: ShieldAlert, status: "Guard" },
  { href: "/testbed", label: "Test Bed", icon: FlaskConical, status: "MCP/API" },
  { href: "/", label: "Global Command", icon: Activity, hint: "Live" },
  { href: "/console", label: "Capability Mesh", icon: Zap, hint: "Mesh" },
  { href: "/registry", label: "Registry", icon: Boxes, hint: "Capabilities" },
  { href: "/agents", label: "Agents", icon: Bot, hint: "Trust & Risk" },
  { href: "/ledger", label: "Ledger", icon: ScrollText, hint: "Evidence" },
  { href: "/governance", label: "Audit & Compliance", icon: Scale, hint: "Rules" },
  { href: "/safety", label: "Quarantine Zone", icon: Signature, hint: "Review" },
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

  const [virtTime, setVirtTime] = useState<string>('');
  const [viewMode, setViewMode] = useState<'human' | 'machine'>('human');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setVirtTime(now.toLocaleTimeString() + ' (GMT-7)');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
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
    <div className="min-h-screen bg-[#0B0C0E] text-[#D1D5DB] flex flex-col font-sans select-none antialiased">
      {/* Top Universal Header */}
      <header className="bg-[#0B0C0E] border-b border-[#23272E] px-6 h-14 shrink-0 flex items-center justify-between z-30 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded bg-blue-500 flex items-center justify-center p-1 shadow-sm">
            <UserCheck className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight text-white uppercase font-mono">
                VEKLOM
              </span>
              <span className="bg-blue-900/30 text-blue-400 border border-blue-900/40 text-[9px] font-mono px-1.5 py-0.5 rounded tracking-widest font-semibold uppercase">
                COGNITIVE_SHIELD
              </span>
            </div>
            <p className="text-[9px] text-gray-500 font-mono tracking-wide">
              GOVERNANCE PROTOCOL v2.0
            </p>
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

        {/* Global telemetry variables */}
        <div className="flex items-center gap-4 text-[10px] font-mono">
          <div className="flex items-center bg-[#15181E] rounded-md p-1 border border-[#23272E]">
            <button
              onClick={() => setViewMode('human')}
              className={`px-3 py-1 rounded-sm transition-all ${
                viewMode === 'human' 
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' 
                  : 'text-gray-500 hover:text-gray-300 border border-transparent'
              }`}
            >
              HUMAN
            </button>
            <button
              onClick={() => setViewMode('machine')}
              className={`px-3 py-1 rounded-sm transition-all ${
                viewMode === 'machine' 
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                  : 'text-gray-500 hover:text-gray-300 border border-transparent'
              }`}
            >
              MACHINE
            </button>
          </div>
          <div className="hidden md:flex items-center gap-1.5 text-gray-500">
            <ClockIcon className="w-3.5 h-3.5 text-blue-400" />
            <span>{virtTime || '...' }</span>
          </div>
          <div className="flex items-center gap-2 text-green-400 bg-green-950/20 border border-green-900/40 px-2 py-0.5 rounded text-[9px] uppercase font-semibold">
            <Radio className="w-2.5 h-2.5 text-green-400 animate-pulse" />
            Policy Engine active
          </div>
        </div>
      </header>

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
      {/* Primary Workspace Panel Layout */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 min-w-0">
        {/* Navigation Sidebar */}
        <aside className="bg-[#0B0C0E] border-r border-[#23272E] lg:w-64 shrink-0 flex flex-col justify-between py-4 px-3 select-none">
          <div className="space-y-6">
            <div className="space-y-1">
              <span className="text-[10px] text-gray-500 tracking-widest font-bold uppercase px-3 block">
                Infrastructure
              </span>
              <nav className="space-y-1 pt-1.5">
                {NAV.map((item) => {
                  const active = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cx(
                        "w-full text-left py-2 px-3 rounded-md text-xs font-semibold flex items-center justify-between transition-all",
                        active
                          ? "bg-[#1A1D23] text-white border border-[#23272E]"
                          : "text-gray-400 hover:bg-[#15181E] hover:text-white"
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <Icon className={cx("w-3.5 h-3.5", active ? "text-blue-400" : "text-gray-400")} />
                        {item.label}
                      </span>
                      <span className="text-[9px] bg-[#0B0C0E] font-mono text-gray-500 px-1.5 py-0.5 rounded border border-[#23272E]">
                        {item.hint}
                      </span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>
          
          <div className="p-3 border-t border-[#23272E] mt-auto">
             <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-2">
                Metrics
             </div>
             <div className="space-y-1 text-xs text-gray-400">
               <div className="flex justify-between">
                 <span>Authz:</span>
                 <span className="font-mono text-white">{m ? m.authorized_rate : "—"}</span>
               </div>
               <div className="flex justify-between">
                 <span>Denied:</span>
                 <span className="font-mono text-red-400">{m ? m.denied : "—"}</span>
               </div>
               <div className="flex justify-between">
                 <span>Anomalies:</span>
                 <span className="font-mono text-amber-400">{m ? m.anomalies : "—"}</span>
               </div>
             </div>
          </div>
        </aside>

        <main className="flex-1 min-w-0 bg-[#0F1115] overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
