"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Braces,
  Check,
  Copy,
  FlaskConical,
  Network,
  Play,
  RefreshCw,
  Server,
  ShieldCheck,
} from "lucide-react";
import { useLive } from "@/components/useLive";
import { Eyebrow, Panel } from "@/components/ui";
import { cx } from "@/components/util";
import type { CovenantResponse, PhaseTrace } from "@/lib/covenant/types";

type Protocol = "http" | "mcp";
type Tab = "playground" | "runner" | "handshake" | "templates";

interface McpServerSummary {
  id: string;
  type: string;
  status: string;
  tool_count: number;
  error?: string;
}

interface McpServersResponse {
  openapi_servers: Array<{ server_id: string; base_url: string; tool_count: number }>;
  native_mcp_servers: McpServerSummary[];
  total_tools: number;
}

interface RunnerResult {
  label: string;
  endpoint: string;
  status: "pass" | "fail";
  detail: string;
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function isPhaseTrace(value: unknown): value is PhaseTrace {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.phase === "number" && typeof candidate.name === "string";
}

function isCovenantResponse(value: unknown): value is CovenantResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.status === "string" && Array.isArray(candidate.trace);
}

export default function TestBed() {
  const { data } = useLive();
  const agents = data?.agents ?? [];
  const capabilities = data?.capabilities ?? [];
  const [servers, setServers] = useState<McpServersResponse | null>(null);
  const [tab, setTab] = useState<Tab>("playground");
  const [agentId, setAgentId] = useState("");
  const [capabilityId, setCapabilityId] = useState("");
  const [protocol, setProtocol] = useState<Protocol>("http");
  const [language, setLanguage] = useState("typescript");
  const [action, setAction] = useState("inspect");
  const [input, setInput] = useState("{}");
  const [requestPayload, setRequestPayload] = useState<unknown>(null);
  const [responsePayload, setResponsePayload] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"request" | "response" | null>(null);
  const [runner, setRunner] = useState<RunnerResult[]>([]);

  const selectedCapability = useMemo(
    () => capabilities.find((capability) => capability.capability_id === capabilityId),
    [capabilities, capabilityId],
  );

  useEffect(() => {
    if (!agentId && agents[0]) setAgentId(agents[0].identity.agent_id);
  }, [agentId, agents]);

  useEffect(() => {
    if (!capabilityId && capabilities[0]) setCapabilityId(capabilities[0].capability_id);
  }, [capabilityId, capabilities]);

  useEffect(() => {
    fetch("/api/mcp/servers", { cache: "no-store" })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) throw new Error("MCP server discovery failed");
        setServers(body as McpServersResponse);
      })
      .catch(() => setServers(null));
  }, []);

  const runRequest = async () => {
    if (!agentId || !capabilityId) {
      setError("Select an agent and capability from live /api/state data.");
      return;
    }
    let parsedInput: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(input);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      parsedInput = parsed as Record<string, unknown>;
    } catch {
      setError("Input must be a JSON object.");
      return;
    }

    const payload = {
      connection_id: crypto.randomUUID(),
      agent_id: agentId,
      capability_id: capabilityId,
      action,
      input: parsedInput,
      context: { audit_tags: ["testbed", protocol, language] },
    };
    setRequestPayload(payload);
    setResponsePayload(null);
    setError(null);
    setBusy(true);
    try {
      const response = await fetch("/api/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Covenant-Protocol": protocol,
          "X-Covenant-Runtime": language,
        },
        body: JSON.stringify(payload),
      });
      const body: unknown = await response.json();
      setResponsePayload(body);
      if (!response.ok) setError(isRecord(body) && typeof body.error === "string" ? body.error : `Request failed (${response.status})`);
    } catch {
      setError("The cAPI request route did not return a response.");
    } finally {
      setBusy(false);
    }
  };

  const runDiscoveryChecks = async () => {
    setRunner([]);
    const checks: Array<{ label: string; endpoint: string; run: () => Promise<Response> }> = [
      { label: "Live state discovery", endpoint: "GET /api/state", run: () => fetch("/api/state", { cache: "no-store" }) },
      { label: "MCP server discovery", endpoint: "GET /api/mcp/servers", run: () => fetch("/api/mcp/servers", { cache: "no-store" }) },
    ];
    const results: RunnerResult[] = [];
    for (const check of checks) {
      try {
        const response = await check.run();
        results.push({ label: check.label, endpoint: check.endpoint, status: response.ok ? "pass" : "fail", detail: `HTTP ${response.status}` });
      } catch {
        results.push({ label: check.label, endpoint: check.endpoint, status: "fail", detail: "No response" });
      }
    }
    setRunner(results);
  };

  const copy = async (kind: "request" | "response", value: unknown) => {
    if (value === null) return;
    await navigator.clipboard.writeText(formatJson(value));
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="mx-auto max-w-[1220px] space-y-5">
      <div className="flex flex-col gap-4 rounded-lg border border-[#23272E] bg-[#0F1115] p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <Eyebrow>Unified connection surface</Eyebrow>
          <h1 className="mt-2 flex items-center gap-2 font-sans text-xl font-semibold text-white">
            <Network className="h-4 w-4 text-blue-400" /> MCP + API Test Bed
          </h1>
          <p className="mt-1 max-w-2xl font-mono text-xs text-gray-500">
            Dispatch a real governed request, inspect its phase trace, and verify live MCP discovery without seeded state.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["playground", "runner", "handshake", "templates"] as const).map((item) => (
            <button key={item} onClick={() => setTab(item)} className={cx("rounded border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider", tab === item ? "border-blue-500/60 bg-blue-950/30 text-blue-400" : "border-[#23272E] text-gray-500 hover:text-white")}>
              {item === "handshake" ? "MCP discovery" : item}
            </button>
          ))}
        </div>
      </div>

      {tab === "playground" && (
        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <Panel className="space-y-4 p-4">
            <div className="flex items-center gap-2 border-b border-[#23272E] pb-3 font-mono text-xs font-bold uppercase text-white">
              <FlaskConical className="h-3.5 w-3.5 text-blue-400" /> Dispatch parameters
            </div>
            <Field label="Caller agent">
              <select value={agentId} onChange={(event) => setAgentId(event.target.value)} className="control">
                {!agents.length && <option>Needs proof — no agents returned</option>}
                {agents.map((agent) => <option key={agent.identity.agent_id} value={agent.identity.agent_id}>{agent.identity.agent_name} · trust {agent.trust?.score ?? "—"}</option>)}
              </select>
            </Field>
            <Field label="Capability">
              <select value={capabilityId} onChange={(event) => setCapabilityId(event.target.value)} className="control">
                {!capabilities.length && <option>Needs proof — no capabilities returned</option>}
                {capabilities.map((capability) => <option key={capability.capability_id} value={capability.capability_id}>{capability.capability_name}</option>)}
              </select>
              {selectedCapability && <div className="mt-1 font-mono text-[10px] text-gray-500">{selectedCapability.endpoint} · {selectedCapability.metadata.category}</div>}
            </Field>
            <Field label="Protocol">
              <div className="grid grid-cols-2 gap-1.5">
                {(["http", "mcp"] as const).map((value) => <button key={value} onClick={() => setProtocol(value)} className={cx("rounded border px-2 py-2 font-mono text-[10px] uppercase", protocol === value ? "border-blue-500 bg-blue-950/30 text-blue-400" : "border-[#23272E] text-gray-500")}>{value === "http" ? "HTTP / JSON" : "MCP / JSON-RPC"}</button>)}
              </div>
            </Field>
            <Field label="Runtime language">
              <div className="grid grid-cols-2 gap-1.5">
                {(["typescript", "python"] as const).map((value) => <button key={value} onClick={() => setLanguage(value)} className={cx("rounded border px-2 py-2 font-mono text-[10px] uppercase", language === value ? "border-blue-500 bg-blue-950/30 text-blue-400" : "border-[#23272E] text-gray-500")}>{value}</button>)}
              </div>
            </Field>
            <Field label="Action"><input value={action} onChange={(event) => setAction(event.target.value)} className="control" /></Field>
            <Field label="Input parameters · JSON">
              <textarea value={input} onChange={(event) => setInput(event.target.value)} rows={5} spellCheck={false} className="control min-h-[120px] resize-y font-mono text-xs text-blue-300" />
            </Field>
            {error && <div className="rounded border border-rose-900/50 bg-rose-950/20 p-2 font-mono text-[11px] text-rose-300">{error}</div>}
            <button onClick={runRequest} disabled={busy || !agentId || !capabilityId} className="flex w-full items-center justify-center gap-2 rounded border border-blue-400 bg-blue-500 px-3 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} {busy ? "Running pipeline…" : "Dispatch governed call"}
            </button>
          </Panel>
          <div className="grid gap-5 xl:grid-cols-2">
            <JsonPanel title="Request · outgoing" value={requestPayload} onCopy={() => copy("request", requestPayload)} copied={copied === "request"} />
            <JsonPanel title="Response · returned" value={responsePayload} onCopy={() => copy("response", responsePayload)} copied={copied === "response"} />
            {isCovenantResponse(responsePayload) && <PhaseTracePanel trace={responsePayload.trace} />}
          </div>
        </div>
      )}

      {tab === "runner" && <Panel className="space-y-4 p-5"><SectionTitle icon={<ShieldCheck className="h-4 w-4 text-emerald-400" />}>Live discovery checks</SectionTitle><p className="font-mono text-xs text-gray-500">Only route-backed checks are shown; no synthetic latency or connection state is added.</p><button onClick={runDiscoveryChecks} className="rounded border border-blue-500/60 bg-blue-950/30 px-3 py-2 font-mono text-xs uppercase text-blue-400">Run checks</button><div className="grid gap-2 md:grid-cols-2">{runner.map((result) => <div key={result.endpoint} className="rounded border border-[#23272E] bg-[#0B0C0E] p-3"><div className="flex justify-between font-mono text-xs text-white"><span>{result.label}</span><span className={result.status === "pass" ? "text-emerald-400" : "text-rose-300"}>{result.status}</span></div><div className="mt-1 font-mono text-[10px] text-gray-500">{result.endpoint} · {result.detail}</div></div>)}</div></Panel>}

      {tab === "handshake" && <Panel className="space-y-4 p-5"><SectionTitle icon={<Server className="h-4 w-4 text-blue-400" />}>MCP server discovery</SectionTitle><p className="font-mono text-xs text-gray-500">The cAPI server exposes the registered MCP inventory. A live connection is not claimed when the API does not report one.</p><div className="grid gap-3 md:grid-cols-2">{servers?.native_mcp_servers.map((server) => <div key={server.id} className="rounded border border-[#23272E] bg-[#0B0C0E] p-3"><div className="flex justify-between text-sm text-white"><span>{server.id}</span><span className="font-mono text-[10px] text-gray-500">{server.status}</span></div><div className="mt-1 font-mono text-[10px] text-gray-500">{server.type} · {server.tool_count} tools{server.error ? ` · ${server.error}` : ""}</div></div>)}</div>{!servers && <div className="font-mono text-xs text-amber-300">Needs proof — /api/mcp/servers did not return an inventory.</div>}{servers?.native_mcp_servers.length === 0 && <div className="font-mono text-xs text-gray-500">Present — the API returned no native MCP servers.</div>}</Panel>}

      {tab === "templates" && <Panel className="space-y-4 p-5"><SectionTitle icon={<Braces className="h-4 w-4 text-blue-400" />}>Request templates</SectionTitle><p className="font-mono text-xs text-gray-500">Templates are generated from the selected live agent and capability. Authentication signatures are handled by the cAPI route.</p><JsonPanel title={`${language} · ${protocol}`} value={agentId && capabilityId ? { agent_id: agentId, capability_id: capabilityId, action, input: "your JSON object", headers: { "X-Covenant-Protocol": protocol, "X-Covenant-Runtime": language } } : null} /></Panel>}
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="font-mono text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</span>{children}</label>;
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="flex items-center gap-2 border-b border-[#23272E] pb-3 font-mono text-xs font-bold uppercase text-white">{icon}{children}</div>;
}

function JsonPanel({ title, value, onCopy, copied }: { title: string; value: unknown; onCopy?: () => void; copied?: boolean }) {
  return <Panel className="flex min-h-[360px] flex-col overflow-hidden"><div className="flex items-center justify-between border-b border-[#23272E] bg-[#15181E] px-3 py-2 font-mono text-[10px] uppercase text-gray-400"><span>{title}</span>{value !== null && onCopy && <button onClick={onCopy} className="flex items-center gap-1 text-gray-500 hover:text-white">{copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />} {copied ? "Copied" : "Copy"}</button>}</div><pre className="scroll-thin flex-1 overflow-auto whitespace-pre-wrap bg-[#0B0C0E] p-3 font-mono text-[11px] leading-relaxed text-blue-300">{value === null ? <span className="text-gray-600">Waiting for a real response…</span> : formatJson(value)}</pre></Panel>;
}

function PhaseTracePanel({ trace }: { trace: unknown[] }) {
  const phases = trace.filter(isPhaseTrace);
  return <Panel className="xl:col-span-2 p-4"><SectionTitle icon={<ShieldCheck className="h-4 w-4 text-emerald-400" />}>Nine-phase trace · returned evidence</SectionTitle><div className="mt-3 grid gap-2 md:grid-cols-3">{phases.map((phase) => <div key={phase.phase} className="rounded border border-[#23272E] bg-[#0B0C0E] p-3"><div className="flex justify-between font-mono text-[10px] text-gray-500"><span>PHASE {phase.phase}</span><span className={phase.status === "pass" ? "text-emerald-400" : phase.status === "fail" ? "text-rose-300" : "text-amber-300"}>{phase.status}</span></div><div className="mt-1 text-xs text-white">{phase.name}</div><div className="mt-1 font-mono text-[10px] text-gray-500">{phase.summary}</div></div>)}</div></Panel>;
}
