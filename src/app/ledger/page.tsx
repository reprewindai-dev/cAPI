"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { Link2, Play } from "lucide-react";
import { useLive } from "@/components/useLive";
import { Eyebrow, Panel, Verdict, KeyVal, Json } from "@/components/ui";
import { cx, getJSON, short, timeAgo } from "@/components/util";
import type { Evidence } from "@/lib/covenant/types";

export default function LedgerPage() {
  const { data } = useLive();
  const audit = useMemo(() => data?.audit ?? [], [data]);
  const [selected, setSelected] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [chain, setChain] = useState<Evidence[]>([]);

  useEffect(() => {
    if (!selected && audit.length) setSelected(audit[0].pgl_hash);
  }, [audit, selected]);

  useEffect(() => {
    if (!selected) return;
    getJSON<Evidence>(`/api/pgl/${selected}`).then(setEvidence);
    setChain([]);
  }, [selected]);

  const replay = () => {
    if (!selected) return;
    getJSON<{ chain: Evidence[] }>(`/api/replay/${selected}`).then((d) => setChain(d.chain));
  };

  return (
    <div className="mx-auto max-w-[1180px]">
      <Eyebrow>{`Evidence ledger · hash-chained`}</Eyebrow>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-white">
        Every covenant leaves a proof
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-mute">
        Each record seals who / what / when / why / how, links to the one before it, and is
        tamper-evident. Replay walks the chain backwards from any point.
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-[420px_1fr]">
        <Panel className="p-2">
          <div className="scroll-thin max-h-[640px] overflow-auto">
            {audit.map((e) => (
              <button
                key={e.pgl_hash}
                onClick={() => setSelected(e.pgl_hash)}
                className={cx(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition",
                  selected === e.pgl_hash ? "bg-white/[0.06]" : "hover:bg-white/[0.03]",
                )}
              >
                <span
                  className={cx(
                    "h-2 w-2 shrink-0 rounded-full",
                    e.result.status === "authorized"
                      ? "bg-signal"
                      : e.result.status === "denied"
                        ? "bg-rose-500"
                        : e.result.status === "quarantined"
                          ? "bg-amber-400"
                          : "bg-white/30",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-white/90">
                    {e.who.agent_id} <span className="text-mute">→</span> {e.what.capability_name}
                  </div>
                  <div className="font-mono text-[10px] text-mute">{short(e.pgl_hash, 12)}</div>
                </div>
                <span className="shrink-0 font-mono text-[10px] text-mute">{timeAgo(e.timestamp)}</span>
              </button>
            ))}
          </div>
        </Panel>

        <div className="space-y-4">
          {evidence && (
            <Panel className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Eyebrow>Evidence record</Eyebrow>
                <div className="flex items-center gap-2">
                  <Verdict status={evidence.result.status} />
                  <button
                    onClick={replay}
                    className="inline-flex items-center gap-1.5 rounded-md border border-violet/40 bg-violet/10 px-2.5 py-1 font-mono text-[10px] tracking-wider text-violet transition hover:bg-violet/20"
                  >
                    <Play size={11} /> REPLAY CHAIN
                  </button>
                </div>
              </div>
              <div className="mt-3 grid gap-x-8 sm:grid-cols-2">
                <KeyVal k="who" v={evidence.who.agent_id} />
                <KeyVal k="what" v={evidence.what.capability_name} />
                <KeyVal k="action" v={evidence.what.action} />
                <KeyVal k="how" v={`${evidence.how.method} · ${evidence.how.endpoint}`} />
                <KeyVal k="why" v={evidence.why.policy_applied} />
                <KeyVal k="class" v={evidence.compliance.data_classification} />
                <KeyVal k="pgl hash" v={short(evidence.pgl_hash, 10)} />
                <KeyVal k="prev hash" v={evidence.previous_hash ? short(evidence.previous_hash, 10) : "genesis"} />
                <KeyVal k="output hash" v={short(evidence.result.output_hash, 10)} />
                <KeyVal k="exec" v={`${evidence.result.execution_time_ms.toFixed(1)}ms`} />
              </div>
            </Panel>
          )}

          {chain.length > 0 && (
            <Panel className="p-5">
              <Eyebrow>Chain · {chain.length} link{chain.length === 1 ? "" : "s"}</Eyebrow>
              <ol className="mt-4 space-y-0">
                {chain.map((e, i) => (
                  <li key={e.pgl_hash} className="relative pl-8">
                    {i < chain.length - 1 && (
                      <span className="absolute left-[11px] top-6 h-[calc(100%-8px)] w-px bg-gradient-to-b from-violet/50 to-violet/10" />
                    )}
                    <span className="absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full border border-violet/40 bg-ink-900">
                      <Link2 size={11} className="text-violet" />
                    </span>
                    <div className="pb-4">
                      <div className="flex items-center gap-2 text-sm text-white/90">
                        {e.who.agent_id} <span className="text-mute">→</span> {e.what.capability_name}
                        <span
                          className={cx(
                            "font-mono text-[10px]",
                            e.result.status === "authorized" ? "text-signal" : "text-rose-300",
                          )}
                        >
                          {e.result.status}
                        </span>
                      </div>
                      <div className="font-mono text-[10px] text-mute">{short(e.pgl_hash, 14)}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </Panel>
          )}

          {evidence && (
            <Panel className="p-5">
              <Eyebrow>Raw record</Eyebrow>
              <div className="mt-3">
                <Json data={evidence} />
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
