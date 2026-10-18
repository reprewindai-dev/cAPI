/**
 * Runs one governed call end to end through /mcp, the same path an external
 * agent uses: discover the package, ask CAPPO for a mount, ask CAPPO to decide
 * the action, then collect and verify the ledger receipt and end the mount.
 * Every stage reports what actually happened; nothing is simulated locally.
 */

import { decisionOf, findEventHash, mcpCall, newOperationId, readMount, upstreamBody, type RpcExchange } from "./tryIt";

export interface PackageRef {
  id: string;
  reads: string[];
  writes: string[];
  blocked: string[];
  target_ref: string | null;
}

export interface GovernedCallSpec {
  pkg: PackageRef;
  action: string;
  resource: string;
  targetRef: string;
  args: Record<string, unknown>;
  workspace: string;
  project: string;
  /** Scope to request for the mount. Defaults to everything the package allows. */
  mountScope?: { reads: string[]; writes: string[] };
}

export type StageKey = "credential" | "discovery" | "mount" | "action" | "evidence" | "verify" | "terminate";
export type StageStatus = "pending" | "running" | "pass" | "fail" | "skipped";

export interface Stage {
  key: StageKey;
  title: string;
  status: StageStatus;
  detail: string;
  exchange?: RpcExchange;
}

export interface GovernedCallResult {
  verdict: "allow" | "deny" | "error";
  reason: string;
  receipt?: string;
  stages: Stage[];
}

export const STAGE_TITLES: Record<StageKey, string> = {
  credential: "Credential",
  discovery: "Live discovery",
  mount: "CAPPO mount",
  action: "CAPPO decision on the action",
  evidence: "Evidence receipt",
  verify: "Ledger verification",
  terminate: "Mount cleanup",
};

export function initialStages(): Stage[] {
  return (Object.keys(STAGE_TITLES) as StageKey[]).map((key) => ({ key, title: STAGE_TITLES[key], status: "pending", detail: "" }));
}

function reasonOf(exchange: RpcExchange): string {
  const body = upstreamBody(exchange.payload);
  for (const key of ["reason", "detail", "error"]) {
    const value = body?.[key];
    if (typeof value === "string" && value) return value;
  }
  return exchange.isError ? `HTTP ${exchange.httpStatus}` : "ok";
}

export async function runGovernedCall(
  spec: GovernedCallSpec,
  credential: string,
  onUpdate: (stages: Stage[]) => void = () => {},
): Promise<GovernedCallResult> {
  const stages = initialStages();
  const set = (key: StageKey, patch: Partial<Stage>) => {
    const i = stages.findIndex((s) => s.key === key);
    stages[i] = { ...stages[i], ...patch };
    onUpdate(stages.map((s) => ({ ...s })));
  };
  const skipRest = (from: StageKey[]) => from.forEach((key) => set(key, { status: "skipped", detail: "not reached" }));
  const finish = (verdict: GovernedCallResult["verdict"], reason: string, receipt?: string): GovernedCallResult => ({
    verdict,
    reason,
    receipt,
    stages: stages.map((s) => ({ ...s })),
  });

  // 1. Credential: presence only. CAPPO is the judge of whether it is valid.
  if (credential.trim().length < 8) {
    set("credential", { status: "fail", detail: "No Veklom credential. Sign up at veklom.com to get one." });
    skipRest(["discovery", "mount", "action", "evidence", "verify", "terminate"]);
    return finish("error", "A Veklom credential is required to act.");
  }
  set("credential", { status: "pass", detail: "Presented to CAPPO as a bearer token. CAPPO validates it." });

  // 2. Discovery: the package must be in CAPPO's live catalog.
  set("discovery", { status: "running" });
  const discovery = await mcpCall("tools/call", { name: "veklom_discover_capabilities", arguments: {} });
  const catalog = upstreamBody(discovery.payload);
  const listed = Array.isArray((discovery.payload as { response?: unknown } | undefined)?.response)
    ? ((discovery.payload as { response: Array<{ id?: unknown }> }).response)
    : [];
  if (discovery.isError || !listed.some((p) => p.id === spec.pkg.id)) {
    set("discovery", { status: "fail", exchange: discovery, detail: discovery.isError ? `Catalog unavailable: ${String(catalog?.error ?? discovery.httpStatus)}` : `${spec.pkg.id} is not in CAPPO's catalog.` });
    skipRest(["mount", "action", "evidence", "verify", "terminate"]);
    return finish("error", "The package could not be discovered.");
  }
  set("discovery", { status: "pass", exchange: discovery, detail: `${spec.pkg.id} found in CAPPO's live catalog.` });

  // 3. Mount: CAPPO decides whether to grant a bounded, expiring mount.
  set("mount", { status: "running" });
  const scope = spec.mountScope ?? { reads: spec.pkg.reads, writes: spec.pkg.writes };
  const mountCall = await mcpCall(
    "tools/call",
    {
      name: "veklom_mount_capability",
      arguments: { package_ref: spec.pkg.id, workspace: spec.workspace, project: spec.project, reads: scope.reads, writes: scope.writes, ttl_seconds: 120 },
    },
    credential,
  );
  const mount = readMount(mountCall.payload);
  if (!mount.mount_id || !mount.token_id || !mount.nonce) {
    set("mount", { status: "fail", exchange: mountCall, detail: `No mount: ${reasonOf(mountCall)}` });
    skipRest(["action", "evidence", "verify", "terminate"]);
    return finish(mount.decision === "deny" ? "deny" : "error", reasonOf(mountCall));
  }
  set("mount", {
    status: "pass",
    exchange: mountCall,
    detail: `Mounted ${mount.mount_id} with reads [${scope.reads.join(", ")}] writes [${scope.writes.join(", ")}].`,
  });
  const actingCredential = mount.holder_credential ?? credential;

  // 4. Action: reads go to the target's own state; everything else asks CAPPO to execute.
  set("action", { status: "running" });
  const isRead = spec.pkg.reads.includes(spec.action) && !spec.pkg.writes.includes(spec.action);
  const actionCall = isRead
    ? await mcpCall(
        "tools/call",
        { name: "veklom_read_target_state", arguments: { target_ref: spec.targetRef, resource: spec.resource, mount_id: mount.mount_id, workspace: spec.workspace } },
        actingCredential,
      )
    : await mcpCall(
        "tools/call",
        {
          name: "veklom_execute_action",
          arguments: {
            mount_id: mount.mount_id,
            token_id: mount.token_id,
            nonce: mount.nonce,
            action: spec.action,
            target_ref: spec.targetRef,
            resource: spec.resource,
            operation_id: newOperationId(),
            arguments: spec.args,
            workspace: spec.workspace,
          },
        },
        actingCredential,
      );
  const decision = isRead ? (actionCall.isError ? "deny" : "allow") : decisionOf(actionCall.payload) ?? (actionCall.isError ? "deny" : "allow");
  const allowed = decision === "allow" && !actionCall.isError;
  set("action", {
    status: allowed ? "pass" : "fail",
    exchange: actionCall,
    detail: `${isRead ? "Read" : "Execute"} ${spec.action}: CAPPO ${allowed ? "allowed" : "refused"} — ${reasonOf(actionCall)}`,
  });

  // 5. Evidence: the receipt CAPPO anchored for the action, else the one it anchored for the mount.
  const actionReceipt = findEventHash(actionCall.payload);
  const receipt = actionReceipt ?? findEventHash(mountCall.payload);
  set(
    "evidence",
    receipt
      ? { status: "pass", detail: `${actionReceipt ? "Action" : "Mount"} receipt pgl_event_hash ${receipt}${actionReceipt ? "" : " (CAPPO anchored no receipt for the action itself)"}` }
      : { status: "skipped", detail: "CAPPO returned no ledger anchor for this call." },
  );

  // 6. Verify the receipt in PGL through the public tool.
  if (receipt) {
    set("verify", { status: "running" });
    const verify = await mcpCall("tools/call", { name: "veklom_verify_evidence", arguments: { event_hash: receipt } });
    const found = upstreamBody(verify.payload)?.found_in_ledger === true;
    set("verify", { status: found ? "pass" : "fail", exchange: verify, detail: found ? "Found in the PGL ledger." : `Not confirmed: ${reasonOf(verify)}` });
  } else {
    set("verify", { status: "skipped", detail: "Nothing to verify." });
  }

  // 7. End the mount so nothing else can run under it.
  set("terminate", { status: "running" });
  const terminate = await mcpCall(
    "tools/call",
    { name: "veklom_terminate_mount", arguments: { mount_id: mount.mount_id, reason: "console_call_done", workspace: spec.workspace } },
    actingCredential,
  );
  set("terminate", { status: terminate.isError ? "fail" : "pass", exchange: terminate, detail: terminate.isError ? `Terminate failed: ${reasonOf(terminate)}` : "Mount ended." });

  const state = isRead ? upstreamBody(actionCall.payload)?.state : undefined;
  const reason = isRead && allowed && state !== undefined ? `Target state: ${JSON.stringify(state)}` : reasonOf(actionCall);
  return finish(allowed ? "allow" : "deny", reason, receipt);
}
