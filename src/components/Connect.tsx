"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Check, Copy, ExternalLink, KeyRound, Lock, Play, Plug, RefreshCw, ShieldCheck } from "lucide-react";
import { Eyebrow, Json, LiveDot, Panel } from "@/components/ui";
import { cx } from "@/components/util";
import {
  GOVERNED_COUNTER,
  decisionOf,
  findEventHash,
  mcpCall,
  newOperationId,
  getSessionCredentials,
  readMount,
  setSessionCredentials,
  upstreamBody,
  workspaceFromToken,
  type MountHandle,
  type RpcExchange,
} from "@/lib/mcp/tryIt";

const PUBLIC_ORIGIN = "https://capi.veklom.com";
const SIGN_UP_URL = "https://veklom.com/signup";
const TOKEN_PLACEHOLDER = "<YOUR_VEKLOM_TOKEN>";

type DependencyState = { state: string; host: string | null; latency_ms: number | null };
type Dependencies = { status: string; dependencies: Record<string, DependencyState> };
type ToolSummary = { name: string; title?: string; description?: string; annotations?: { readOnlyHint?: boolean } };
type CapabilityPackage = { id: string; title?: string; purpose?: string; family?: string; reads?: string[]; writes?: string[]; blocked?: string[] };
type StepKey = "mount" | "increment" | "state" | "blocked" | "verify" | "terminate";

function noopSubscribe(): () => void {
  return () => {};
}

const DEPENDENCY_LABEL: Record<string, string> = {
  cappo: "CAPPO · authority",
  pgl: "PGL · evidence ledger",
  lockerphycer: "Lockerphycer · identity",
  byos: "BYOS · data plane",
};

export default function Connect() {
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => PUBLIC_ORIGIN,
  );
  const endpoint = `${origin}/mcp`;

  return (
    <div className="mx-auto max-w-[1180px] space-y-6">
      <Hero endpoint={endpoint} />
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] [&>*]:min-w-0">
        <SetupSnippets endpoint={endpoint} />
        <LiveStatus />
      </div>
      <Catalog />
      <TryIt />
    </div>
  );
}

function Hero({ endpoint }: { endpoint: string }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border hairline bg-ink-800/30 px-6 py-10 sm:px-10">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-signal/10 blur-3xl" />
      <div className="relative">
        <div className="flex items-center gap-3">
          <Plug size={18} className="text-signal" />
          <Eyebrow>Connect · MCP over HTTP</Eyebrow>
          <LiveDot />
        </div>
        <h1 className="mt-5 max-w-3xl font-display text-3xl font-semibold leading-tight tracking-tight text-white sm:text-5xl">
          Plug any agent into Veklom in one line.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/70">
          Point your MCP client at this endpoint. Discovery is public. To act, sign up for a Veklom credential:
          CAPPO decides every action, and anchored actions return a receipt you can verify in the PGL ledger.
        </p>
        <div className="mt-6 flex max-w-2xl items-center gap-2 rounded-lg border border-signal/40 bg-ink-900/80 p-2 pl-4">
          <code className="min-w-0 flex-1 truncate font-mono text-sm text-signal">{endpoint}</code>
          <CopyButton text={endpoint} label="Copy endpoint" />
        </div>
        <ol className="mt-6 grid gap-3 text-sm text-white/80 sm:grid-cols-3">
          <StepCard n={1} title="Add the server">Paste the endpoint into Claude Code, Cursor or any MCP client.</StepCard>
          <StepCard n={2} title="Get a credential">
            <a className="text-signal underline-offset-2 hover:underline" href={SIGN_UP_URL} target="_blank" rel="noreferrer">
              Sign up at veklom.com
            </a>{" "}
            and use your token, or mint a machine token for the agent.
          </StepCard>
          <StepCard n={3} title="Mount, act, prove">Mount a capability, run one governed action, verify its receipt.</StepCard>
        </ol>
      </div>
    </section>
  );
}

function StepCard({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="rounded-lg border hairline bg-ink-800/50 p-4">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-signal">{String(n).padStart(2, "0")}</span>
        <span className="font-medium text-white">{title}</span>
      </div>
      <p className="mt-1.5 text-mute">{children}</p>
    </li>
  );
}

function SetupSnippets({ endpoint }: { endpoint: string }) {
  const snippets = useMemo(
    () => ({
      "Claude Code": `claude mcp add --transport http veklom ${endpoint} \\\n  --header "Authorization: Bearer ${TOKEN_PLACEHOLDER}"`,
      "Cursor / JSON": JSON.stringify(
        { mcpServers: { veklom: { url: endpoint, headers: { Authorization: `Bearer ${TOKEN_PLACEHOLDER}` } } } },
        null,
        2,
      ),
      curl: `curl -s ${endpoint} \\\n  -H 'content-type: application/json' \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"veklom_discover_capabilities","arguments":{}}}'`,
    }),
    [endpoint],
  );
  const [tab, setTab] = useState<keyof typeof snippets>("Claude Code");

  return (
    <Panel className="p-5">
      <Eyebrow>Add it to your client</Eyebrow>
      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.keys(snippets) as Array<keyof typeof snippets>).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cx(
              "rounded-md border px-3 py-1.5 font-mono text-[11px]",
              tab === key ? "border-signal/40 bg-signal/10 text-signal" : "hairline text-mute hover:text-white",
            )}
          >
            {key}
          </button>
        ))}
      </div>
      <div className="relative mt-3">
        <pre className="scroll-thin overflow-auto rounded-lg border border-white/8 bg-ink-900/80 p-4 pr-14 font-mono text-[11px] leading-relaxed text-white/85">
          {snippets[tab]}
        </pre>
        <div className="absolute right-2 top-2">
          <CopyButton text={snippets[tab]} label="Copy snippet" />
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-mute">
        The Authorization header is only needed for the action tools. Leave it out and the four discovery tools still work.
        Never paste a token into a shared config.
      </p>
    </Panel>
  );
}

function LiveStatus() {
  const [deps, setDeps] = useState<Dependencies | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    fetch("/health/dependencies", { cache: "no-store" })
      .then((r) => r.json() as Promise<Dependencies>)
      .then((body) => {
        setDeps(body);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <Panel className="p-5">
      <div className="flex items-center justify-between">
        <Eyebrow>Live connections</Eyebrow>
        <button onClick={load} className="text-mute hover:text-white" aria-label="Refresh status">
          <RefreshCw size={14} />
        </button>
      </div>
      <p className="mt-2 text-xs text-mute">Probed by this server just now. Reachability is not proof of any action.</p>
      <div className="mt-4 space-y-2">
        {failed && <p className="text-sm text-rose-300">Status probe failed.</p>}
        {!deps && !failed && <p className="text-sm text-mute">Probing…</p>}
        {deps &&
          Object.entries(deps.dependencies).map(([key, dep]) => (
            <div key={key} className="flex items-center justify-between rounded-lg border hairline bg-ink-800/40 px-3 py-2.5">
              <span className="text-sm text-white/85">{DEPENDENCY_LABEL[key] ?? key}</span>
              <span className="flex items-center gap-3 font-mono text-[11px]">
                {dep.latency_ms !== null && <span className="text-mute">{dep.latency_ms} ms</span>}
                <StateBadge state={dep.state} />
              </span>
            </div>
          ))}
      </div>
    </Panel>
  );
}

function StateBadge({ state }: { state: string }) {
  const tone =
    state === "healthy" ? "border-signal/30 bg-signal/10 text-signal" : state === "unconfigured" ? "hairline bg-white/5 text-mute" : "border-rose-500/30 bg-rose-500/10 text-rose-300";
  return <span className={cx("rounded border px-2 py-0.5 uppercase tracking-wider", tone)}>{state}</span>;
}

function Catalog() {
  const [tools, setTools] = useState<ToolSummary[] | null>(null);
  const [packages, setPackages] = useState<CapabilityPackage[] | null>(null);
  const [packageError, setPackageError] = useState<string | null>(null);

  useEffect(() => {
    void mcpCall("tools/list", undefined).then((x) => {
      const list = (x.payload as { tools?: ToolSummary[] } | undefined)?.tools;
      setTools(Array.isArray(list) ? list : []);
    });
    void mcpCall("tools/call", { name: "veklom_discover_capabilities", arguments: {} }).then((x) => {
      const body = (x.payload as { response?: unknown } | undefined)?.response;
      if (!x.isError && Array.isArray(body)) setPackages(body as CapabilityPackage[]);
      else setPackageError(String((x.payload as { error?: string } | undefined)?.error ?? "CAPPO did not return a catalog"));
    });
  }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr] [&>*]:min-w-0">
      <Panel className="p-5">
        <Eyebrow>MCP tools</Eyebrow>
        <div className="mt-4 space-y-2">
          {!tools && <p className="text-sm text-mute">Loading…</p>}
          {tools?.map((tool) => {
            const isPublic = tool.description?.includes("Public.") ?? false;
            return (
              <div key={tool.name} className="rounded-lg border hairline bg-ink-800/40 px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <code className="font-mono text-[12px] text-white/90">{tool.name}</code>
                  <span className={cx("flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider", isPublic ? "text-signal" : "text-amber-300")}>
                    {isPublic ? <ShieldCheck size={11} /> : <Lock size={11} />}
                    {isPublic ? "public" : "credential"}
                  </span>
                </div>
                {tool.title && <p className="mt-1 text-xs text-mute">{tool.title}</p>}
              </div>
            );
          })}
        </div>
      </Panel>
      <Panel className="p-5">
        <Eyebrow>Capability packages · live from CAPPO</Eyebrow>
        <div className="mt-4 space-y-3">
          {!packages && !packageError && <p className="text-sm text-mute">Asking CAPPO…</p>}
          {packageError && <p className="text-sm text-rose-300">Catalog unavailable: {packageError}</p>}
          {packages?.map((pkg) => (
            <div key={pkg.id} className="rounded-lg border hairline bg-ink-800/40 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-white">{pkg.title ?? pkg.id}</span>
                <code className="font-mono text-[11px] text-mute">{pkg.id}</code>
              </div>
              {pkg.purpose && <p className="mt-1.5 text-sm leading-relaxed text-white/70">{pkg.purpose}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-[10px]">
                {[...(pkg.reads ?? []), ...(pkg.writes ?? [])].map((a) => (
                  <span key={a} className="rounded border border-signal/30 bg-signal/10 px-1.5 py-0.5 text-signal">{a}</span>
                ))}
                {(pkg.blocked ?? []).map((a) => (
                  <span key={a} className="rounded border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-rose-300 line-through">{a}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function TryIt() {
  const [credential, setCredential] = useState(() => getSessionCredentials().credential);
  const [workspace, setWorkspace] = useState(() => getSessionCredentials().workspace);
  const [project, setProject] = useState(() => getSessionCredentials().project);
  const [mount, setMount] = useState<MountHandle | null>(null);
  const [receipt, setReceipt] = useState<string | undefined>();
  const [log, setLog] = useState<Partial<Record<StepKey, RpcExchange>>>({});
  const [busy, setBusy] = useState<StepKey | null>(null);

  // After a successful mount CAPPO issues a holder credential scoped to that mount;
  // later calls use it so the person's own token is never needed again.
  const actionCredential = mount?.holder_credential ?? credential;
  const ready = credential.trim().length >= 8 && workspace.trim().length > 0 && project.trim().length > 0;

  const run = async (key: StepKey, name: string, args: Record<string, unknown>, cred: string) => {
    setBusy(key);
    const exchange = await mcpCall("tools/call", { name, arguments: args }, cred);
    setLog((prev) => ({ ...prev, [key]: exchange }));
    const hash = findEventHash(exchange.payload);
    if (hash) setReceipt(hash);
    setBusy(null);
    return exchange;
  };

  const doMount = async () => {
    setMount(null);
    setReceipt(undefined);
    setLog({});
    const exchange = await run(
      "mount",
      "veklom_mount_capability",
      {
        package_ref: GOVERNED_COUNTER.package_ref,
        workspace: workspace.trim(),
        project: project.trim(),
        reads: [GOVERNED_COUNTER.read],
        writes: [GOVERNED_COUNTER.increment],
        ttl_seconds: 300,
      },
      credential,
    );
    const handle = readMount(exchange.payload);
    if (handle.mount_id) setMount(handle);
  };

  const doExecute = (key: "increment" | "blocked", action: string) => {
    if (!mount?.mount_id || !mount.token_id || !mount.nonce) return;
    void run(
      key,
      "veklom_execute_action",
      {
        mount_id: mount.mount_id,
        token_id: mount.token_id,
        nonce: mount.nonce,
        action,
        target_ref: GOVERNED_COUNTER.target_ref,
        resource: GOVERNED_COUNTER.resource,
        operation_id: newOperationId(),
        workspace: workspace.trim(),
      },
      actionCredential,
    );
  };

  const steps: Array<{ key: StepKey; title: string; body: string; disabled: boolean; onRun: () => void }> = [
    {
      key: "mount",
      title: "Mount the Governed Counter",
      body: "Ask CAPPO for a 5-minute mount that may read the counter and increment it. Nothing else.",
      disabled: !ready,
      onRun: () => void doMount(),
    },
    {
      key: "increment",
      title: "Increment it once",
      body: "One consequential action. CAPPO decides; the effect happens at most once for this operation id.",
      disabled: !mount,
      onRun: () => doExecute("increment", GOVERNED_COUNTER.increment),
    },
    {
      key: "state",
      title: "Read what actually happened",
      body: "Read the counter from the target itself, not from cAPI.",
      disabled: !mount,
      onRun: () =>
        void run(
          "state",
          "veklom_read_target_state",
          { target_ref: GOVERNED_COUNTER.target_ref, resource: GOVERNED_COUNTER.resource, mount_id: mount?.mount_id, workspace: workspace.trim() },
          actionCredential,
        ),
    },
    {
      key: "blocked",
      title: "Try the blocked action",
      body: "Ask for counter.reset, which the package blocks. Expect CAPPO to refuse.",
      disabled: !mount,
      onRun: () => doExecute("blocked", GOVERNED_COUNTER.blocked),
    },
    {
      key: "verify",
      title: "Verify the receipt in PGL",
      body: receipt ? `Look up ${receipt.slice(0, 12)}… in the ledger. This tool is public: anyone can check it.` : "Available once CAPPO returns a ledger anchor.",
      disabled: !receipt,
      onRun: () => void run("verify", "veklom_verify_evidence", { event_hash: receipt }, ""),
    },
    {
      key: "terminate",
      title: "End the mount",
      body: "Terminate it so nothing else can run under it.",
      disabled: !mount,
      onRun: () =>
        void run("terminate", "veklom_terminate_mount", { mount_id: mount?.mount_id, reason: "try_it_done", workspace: workspace.trim() }, actionCredential),
    },
  ];

  return (
    <Panel className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Eyebrow>Try it · real calls through /mcp</Eyebrow>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-white">Run one governed action end to end</h2>
        </div>
        <a
          href={SIGN_UP_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-signal/50 bg-signal/15 px-4 py-2 text-sm font-medium text-signal hover:bg-signal/25"
        >
          Get a credential <ExternalLink size={14} />
        </a>
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-mute">
        These buttons send the same JSON-RPC calls your agent would, against the sandbox package <code className="font-mono text-white/80">{GOVERNED_COUNTER.package_ref}</code>.
        Your token stays in this tab and is sent only to this server&apos;s /mcp, which forwards it to CAPPO.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <Field label="Veklom credential" icon={<KeyRound size={13} />}>
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
            className="w-full bg-transparent font-mono text-sm text-white outline-none placeholder:text-mute/60"
          />
        </Field>
        <Field label="Workspace ID">
          <input
            value={workspace}
            onChange={(e) => {
              setWorkspace(e.target.value);
              setSessionCredentials({ workspace: e.target.value });
            }}
            placeholder="from your veklom.com account"
            className="w-full bg-transparent font-mono text-sm text-white outline-none placeholder:text-mute/60"
          />
        </Field>
        <Field label="Project">
          <input
            value={project}
            onChange={(e) => {
              setProject(e.target.value);
              setSessionCredentials({ project: e.target.value });
            }} className="w-full bg-transparent font-mono text-sm text-white outline-none" />
        </Field>
      </div>

      <ol className="mt-6 space-y-3">
        {steps.map((step, index) => {
          const exchange = log[step.key];
          const decision = exchange ? decisionOf(exchange.payload) : undefined;
          return (
            <li key={step.key} className="rounded-xl border hairline bg-ink-800/40 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-[11px] text-signal">{String(index + 1).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-white">{step.title}</div>
                  <div className="text-sm text-mute">{step.body}</div>
                </div>
                {exchange && <Outcome exchange={exchange} decision={decision} />}
                <button
                  onClick={step.onRun}
                  disabled={step.disabled || busy !== null}
                  className={cx(
                    "inline-flex items-center gap-2 rounded-lg border px-3 py-2 font-mono text-[11px] uppercase tracking-wider transition",
                    step.disabled || busy !== null
                      ? "cursor-not-allowed hairline text-mute/60"
                      : "border-signal/40 bg-signal/10 text-signal hover:bg-signal/20",
                  )}
                >
                  {busy === step.key ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
                  Run
                </button>
              </div>
              {exchange && (
                <details className="mt-3">
                  <summary className="cursor-pointer font-mono text-[11px] text-mute hover:text-white">
                    JSON-RPC exchange · HTTP {exchange.httpStatus}
                  </summary>
                  <div className="mt-2 grid gap-2 lg:grid-cols-2">
                    <Json data={exchange.request} />
                    <Json data={exchange.payload} />
                  </div>
                </details>
              )}
              {step.key === "mount" && exchange && !mount && <MountHint exchange={exchange} />}
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

function Outcome({ exchange, decision }: { exchange: RpcExchange; decision: string | undefined }) {
  const body = upstreamBody(exchange.payload);
  const label = decision ?? (exchange.isError ? String(body?.error ?? "error") : "ok");
  const tone = decision === "allow" || (!decision && !exchange.isError) ? "border-signal/30 bg-signal/10 text-signal" : "border-rose-500/30 bg-rose-500/10 text-rose-300";
  return <span className={cx("rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-wider", tone)}>{label}</span>;
}

function MountHint({ exchange }: { exchange: RpcExchange }) {
  const body = upstreamBody(exchange.payload);
  const reason = typeof body?.reason === "string" ? body.reason : typeof body?.detail === "string" ? body.detail : undefined;
  return (
    <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
      No mount was issued{reason ? `: ${reason}` : "."} Check that the workspace matches your credential, then run step 1 again.
    </p>
  );
}

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block rounded-lg border hairline bg-ink-900/70 px-3 py-2 focus-within:border-signal/40">
      <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-mute">
        {icon}
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
      aria-label={label}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border hairline bg-ink-800/80 px-2.5 py-1.5 font-mono text-[11px] text-white/80 hover:text-white"
    >
      {copied ? <Check size={12} className="text-signal" /> : <Copy size={12} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
