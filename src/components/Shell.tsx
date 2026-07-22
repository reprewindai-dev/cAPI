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
