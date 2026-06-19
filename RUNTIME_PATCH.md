# Runtime Patch — Wire Phase 6 to MCPBridge

Four surgical changes to `runtime.ts` and `engine.ts`. Nothing else changes.

---

## Step 1 — Import MCPBridge in `runtime.ts`

```ts
// Add at the top of src/lib/covenant/runtime.ts
import { MCPBridge } from "./mcp-bridge";
```

---

## Step 2 — Replace `executeCapability()` in `runtime.ts`

Remove the existing `private executeCapability(...)` method and replace with:

```ts
private async executeCapability(
  cap:     CapabilityIdentity,
  request: CovenantRequest,
): Promise<Record<string, unknown>> {
  const result = await MCPBridge.execute(cap, request);
  return {
    ...result.output,
    _bridge: {
      transport:    result.transport,
      endpoint:     result.endpoint,
      execution_ms: result.execution_ms,
      retried:      result.retried,
    },
  };
}
```

---

## Step 3 — Make `process()` async in `runtime.ts`

```ts
// Change signature:
process(request: CovenantRequest, opts: ProcessOptions = {}): CovenantResponse
// To:
async process(request: CovenantRequest, opts: ProcessOptions = {}): Promise<CovenantResponse>
```

Then in Phase 6 inside `process()`, change:

```ts
// Before:
const output = this.executeCapability(capability, request);
// After:
const output = await this.executeCapability(capability, request);
```

---

## Step 4 — Make `signAndProcess()` async in `engine.ts`

```ts
// Change signature:
signAndProcess(call: SignedCallInput): CovenantResponse
// To:
async signAndProcess(call: SignedCallInput): Promise<CovenantResponse>
```

Then in `runtime.process()` call inside `engine.ts`:

```ts
// Before:
return this.runtime.process(request, { approvals: call.approvals, bypass: call.bypass });
// After:
return await this.runtime.process(request, { approvals: call.approvals, bypass: call.bypass });
```

---

## Step 5 — Await in `route.ts`

```ts
// Before:
const response = getEngine().signAndProcess({ ... });
// After:
const response = await getEngine().signAndProcess({ ... });
```

---

## Step 6 — Environment Variables

Add to `.env.local` (never commit):

```env
BYOS_MCP_GATEWAY_URL=https://api.veklom.com/api/v1/mcp
BYOS_INTERNAL_API_KEY=your_internal_key_here
COVENANT_EXEC_TIMEOUT_MS=10000
```

---

## What changes at runtime

| Capability endpoint | Transport | What happens |
|---|---|---|
| `mcp://github.create_issue` | MCP gateway | JSON-RPC 2.0 `tools/call` → BYOS |
| `http://partner.api.com/exec` | HTTP | Direct POST with Covenant headers |
| `local://none` | In-process | Deterministic stub (dev/test) |

Every live call carries:
- `X-Covenant-Id` — the connection ID for this governed call
- `X-Agent-Id` — the verified agent identity
- `X-Trace-Id` — the trace context for ledger correlation
- `X-API-Key` — internal BYOS service key

Phase 7 still seals a hash-chained evidence record regardless of which transport fires.
