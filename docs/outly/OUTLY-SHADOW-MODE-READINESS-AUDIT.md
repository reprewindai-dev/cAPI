# Outly Shadow-Mode Readiness Audit

> **Audit/design preparation only.** This document is not an implementation plan approval, a production-readiness claim, or an authorization to alter canonical contracts or runtime behavior.

**Owner approval line:** Authorized as audit/design prep by Anthony Millwater (owner/founder), above the canonical.

## Scope and restrictions

This deliverable is based on `/home/ubuntu/outly-audit/findings.md` and the pinned repository snapshots listed below. It is limited to architecture evidence, draft contract inputs, and design questions.

**Restrictions**

- No production deploy.
- No live Outly integration.
- No automatic settlement.
- No Issue #15 implementation.
- No Solidity.
- No Rust or Go.
- No authority movement.
- No deletion of legacy code.
- No wiring of these drafts into runtime or canonical contract generation.
- Nothing in this document is labeled production-ready.

## Pinned audit snapshots

| Repository | Pinned SHA |
|---|---|
| cAPI | `5891406d74860cb86473dbe12918c41d1ba8f43d` |
| cappo-backend | `273f9fab008efcf8a0f88e4200e080d29f579e3b` |
| gnomledger | `0abe0c7d2ae666ce715b496981eda0e44a7ab537` |
| veklom-byos-backend | `2a7db0f45da97759aabf83426b9aa77dc2681108` |
| ABIDE | `745b8ff393b328ddfa160c3e792887c5823ca1e0` |

## One-page boundary architecture

Shadow mode means Outly remains the executor. Veklom evaluates and records; it does not take the side effect away from Outly.

```text
┌──────────────┐
│ Outly        │
│ proposes     │
└──────┬───────┘
       │ ProposedActionV1 (draft input)
       v
┌──────────────────────────────┐
│ Veklom Intercept              │
│ cAPI / proposed-action gate  │
└──────────────┬───────────────┘
               │ identity, version, replay, policy
               v
┌──────────────────────────────┐
│ Gate                         │
│ CAPPO consult for lane 3     │
│ ALLOW / DENY / MODIFY /      │
│ HUMAN_REVIEW                 │
└──────────────┬───────────────┘
               │ DecisionV1 (draft output)
               v
┌──────────────────────────────┐
│ Anchor                       │
│ PGL / gnomledger evidence    │
└──────────────┬───────────────┘
               │ decision/evidence reference
               v
┌──────────────┐       ┌──────────────────────┐
│ Outly        │──────>│ reports ActionOutcome │
│ stays        │       │ back to Veklom        │
│ executor     │       └──────────┬───────────┘
└──────────────┘                  │
                                  v
                         ┌─────────────────────┐
                         │ Anchor reported      │
                         │ outcome as evidence  │
                         └─────────────────────┘
```

**Boundary statement:** Outly remains the executor. A shadow-mode Veklom decision is advisory/evaluative until separately authorized; the executor boundary must not move implicitly through an endpoint or schema change.

## Exact current cAPI request path

The observed active path is:

```text
POST /api/request
  → src/app/api/request/route.ts
  → CovenantEngine
  → CovenantRuntime.process()
  → identity/signature/replay and local policy gates
  → MCPBridge
  → local evidence seal and in-memory hash chain
  → optional asynchronous gnomledger forward
  → CovenantResponse
```

### Stage-by-stage evidence

| Stage | Citation | Classification | Current finding |
|---|---|---|---|
| Request ingress | `src/app/api/request/route.ts:7-24` | `OBSERVED_IMPLEMENTED` | Parses JSON, checks signed-request fields, and calls `engine.runtime.process`; fallback is `:26-52`. |
| Tenant/workspace identity | `src/lib/covenant/mcp-bridge.ts:245-255`; `src/lib/covenant/types.ts:130-143` | `WIRED_UNVERIFIED` | Workspace can be extracted from context and sent downstream, but no verified tenant principal is established by this cAPI route. |
| Connection identity + version | `src/lib/covenant/types.ts:130-143`; `src/lib/covenant/engine.ts:77-97` | `CONFLICTED` | Active request has `connection_id` but no `connection_version`; the versioned contract requires both in `contracts/schemas/v1/TrustConnectionV1.schema.json:8-14`. |
| Capability identity + version | `src/lib/covenant/runtime.ts:401-406`; `src/lib/covenant/types.ts:130-143` | `CONFLICTED` | Capability ID is looked up, but active request has no capability version while `contracts/graphql/operations/manifest.json:3-13` carries operation/schema versions. |
| Signature + nonce validation | `src/lib/covenant/runtime.ts:366-384`; `src/lib/covenant/crypto.ts:54-94`; `src/lib/covenant/mcp-bridge.ts:235-259` | `CONFLICTED` | Ed25519 signature validation is implemented, but inbound request nonce validation is absent; a separate downstream envelope nonce exists. |
| Replay protection | `src/lib/covenant/runtime.ts:385-397` | `OBSERVED_IMPLEMENTED` | Duplicate connection IDs are rejected through an in-process `seenConnections` set; restart persistence was not observed. |
| Policy evaluation | `src/lib/covenant/runtime.ts:410-464`; `src/lib/covenant/governance.ts:97-175` | `OBSERVED_IMPLEMENTED` | Capability, delegation, trust, policy composition, permissions, safety, budget, and approval gates are evaluated. |
| CAPPO decision | `src/lib/covenant/mcp-bridge.ts:227-276`; `src/app/api/capi/v1/execute/route.ts:26-45` | `WIRED_UNVERIFIED` | No direct cappo-backend import; a payload named `cappoPayload` is posted to configured `capability.endpoint` with `policy_applied: "default"`. |
| DecisionV1-style response | `src/lib/covenant/types.ts:145-163`; `src/lib/covenant/runtime.ts:668-679` | `MISSING` | Active response vocabulary is `authorized/denied/error/quarantined`, not exactly `ALLOW/DENY/MODIFY/HUMAN_REVIEW`. |
| Outly outcome reporting | `src/app/api/request/route.ts:7-52`; `src/app/api/capi/v1/evidence/[id]/route.ts:3-27` | `MISSING` | No active endpoint accepts a separately reported Outly executor outcome; the evidence route is fabricated mock retrieval. |
| PGL evidence anchoring | `src/lib/covenant/runtime.ts:169-231`; `src/lib/covenant/pgl-ledger.ts:61-127` | `WIRED_UNVERIFIED` | Local sealing is implemented; gnomledger POST is conditional on `PGL_LEDGER_URL` and best-effort/asynchronous. |

## Runtime-authority conflict report

The canonical active runtime is `src/lib/covenant/`. Active API routes import `@/lib/covenant/*`, including `src/app/api/request/route.ts:1-3`, while `tsconfig.json:25-26` explicitly excludes `interlink-capifull`. `package.json:5-9` has no interlink entrypoint. Therefore:

**`interlink-capifull/` = `DEMO_REFERENCE_CODE`**

The reference tree contains explicit simulation and placeholder language:

- `interlink-capifull/mcpapi-runtime.ts:490-499`: simulated PGL registration into an in-memory map.
- `interlink-capifull/mcpapi-runtime.ts:612-614`: simulated capability execution with a fixed success object.
- `interlink-capifull/mcpapi-runtime.ts:712-719`: base64 placeholder for future AES-256-GCM.
- `interlink-capifull/mcpapi-veklom-integration.ts:591-651`: hardcoded example identities/bundles.

There is also a second mock/demo generation under active Next.js route names:

- `src/app/api/capi/v1/execute/route.ts:48-75` explicitly labels execution simulated, fabricates output, and returns `authorized`.
- `src/app/api/capi/v1/evidence/[id]/route.ts:6-27` explicitly returns fabricated evidence.
- `src/app/api/capi/v1/capabilities/route.ts:4-25` returns a fixed `MOCK_CAPABILITIES` list and comments that real scope filtering is absent.

These `/api/capi/v1/*` routes are a separate mock generation and should not be confused with the active Covenant path.

## Evidence matrix: simulated, simplified, and placeholder locations

| ID | File:line | Pretends to do | Actually does | Shadow-mode impact |
|---:|---|---|---|---|
| 1 | `src/app/api/capi/v1/execute/route.ts:48-75` | Execute and authorize a capability | Returns random timing, fixed output, hashes it, and returns `authorized` | Cannot be used as an evidence-backed shadow decision path. |
| 2 | `src/app/api/capi/v1/evidence/[id]/route.ts:6-27` | Retrieve PGL evidence | Returns hardcoded fabricated evidence | Evidence correlation would be false. |
| 3 | `src/app/api/capi/v1/capabilities/route.ts:4-25` | Discover scoped capabilities | Signs and returns a fixed mock list | Capability identity/authorization is not authoritative. |
| 4 | `src/lib/covenant/mcp-bridge.ts:76,93-103,283-295` | Execute a local capability | Returns category-based fabricated local results when enabled | Outly shadow tests could mistake a stub for executor evidence. |
| 5 | `src/lib/covenant/runtime.ts:417-418,468-470,516-517`; `src/app/api/request/route.ts:20-23,47-49` | Apply normal policy, safety, and cost gates | Caller-supplied bypass flags can short-circuit them | A caller could bypass the evaluation being audited. |
| 6 | `src/lib/covenant/engine.ts:103-119` | Return an execution result after an error | Projects cached last-known-good output as `_projected` | Reported outcome may not correspond to the attempted action. |
| 7 | `src/lib/covenant/mcp-bridge.ts:245-255` | Carry applied policy context | Sends `policy_applied: "default"` rather than calculated policy identity/version | CAPPO correlation and policy provenance are ambiguous. |
| 8 | `src/lib/covenant/crypto.ts:118-128` | Produce keyed evidence authentication | Falls back to ordinary SHA-256 if `PGL_HMAC_SECRET` is absent | Evidence integrity is weaker and configuration-dependent. |
| 9 | `src/lib/covenant/runtime.ts:201-202` | Preserve request context | Base64-encodes JSON; this is not encryption | Sensitive context must not be assumed confidential. |
| 10 | `interlink-capifull/mcpapi-runtime.ts:490-499` | Register evidence to PGL | Hashes and stores locally in memory | Reference code cannot prove external anchoring. |
| 11 | `interlink-capifull/mcpapi-runtime.ts:612-614` | Execute a capability | Returns a fixed success message | Reference execution is not an Outly integration. |
| 12 | `interlink-capifull/mcpapi-runtime.ts:448-451,712-719` | Apply policy and encrypt context | Uses `policy-id-placeholder`; base64 encode/decode is exposed as `encrypt`/`decrypt` | Must not be promoted into a contract or security boundary. |

## Build and test report

Commands were run from `/home/ubuntu/repos/capi` in this order:

| Command | Result |
|---|---|
| `npm ci` | Exit `0`; 414 packages added; existing peer/engine warnings; npm reported 2 vulnerabilities. |
| `npx tsc --noEmit` | Exit `0`. |
| `npm run build` | Exit `0`; Next.js compiled, typechecked, and generated 19 static pages/routes; linting skipped by build. |
| `npx vitest run` | Exit `0`; **2 test files passed, 7 tests passed**. |
| `python3 contracts/scripts/build-operation-registry.py --check` | Exit `0`; `operation registry is up to date`. |
| `python3 contracts/scripts/emit-schemas.py` | Exit `0`; 14 canonical schemas emitted. |
| `python3 contracts/scripts/compatibility-check.py` | Exit `0`; `Compatibility checks passed.` |

After schema emission, `git diff --exit-code -- contracts/schemas/v1/` returned **0**, confirming that draft files did not leak into canonical generated schemas. `git diff --check` also returned **0**.

The known `npm run lint` ESLint-10/legacy-configuration incompatibility is non-gating and was not changed.

## Blocking gaps for shadow mode

1. No active `DecisionV1` response vocabulary exactly matching `ALLOW`, `DENY`, `MODIFY`, and `HUMAN_REVIEW`.
2. No active Outly outcome-ingest endpoint.
3. No proven cAPI → cappo-backend decision call. The bridge posts to a configured endpoint and sets `governance_context.policy_applied` to `"default"`.
4. gnomledger anchoring is optional/config-dependent and best-effort. Without `PGL_HMAC_SECRET`, the evidence helper falls back from HMAC-SHA256 to plain SHA-256.
5. Caller-supplied `bypass` flags can short-circuit policy, safety, and cost; this is a shadow-mode evaluation risk.
6. The inbound runtime request lacks `connection_version`, `capability_version`, and nonce even though versioned contract artifacts require related version fields.
7. The current active path makes cAPI the executor through MCP/HTTP capability execution, which does not match the requested boundary where Outly remains the executor.

## Recommended narrow shadow-mode implementation packet INPUT for ABIDE

This is a proposal, **not an authorization and not code**:

1. An intercept endpoint accepting the proposed `ProposedActionV1` draft shape.
2. A deterministic gate returning the proposed `DecisionV1` shape.
3. A CAPPO consult for consequential lane-3 actions, with a verifiable authorization reference.
4. An outcome-ingest endpoint accepting the proposed `ActionOutcomeV1` shape after Outly executes.
5. Evidence anchoring for both the decision and reported outcome, with correlation and idempotency checks.

This packet must be compiled through ABIDE and separately authorized before any implementation. The files under `contracts/drafts/outly/` are **inputs, not contracts**. They are deliberately outside the canonical `emit-schemas`, registry, and compatibility pipeline.
