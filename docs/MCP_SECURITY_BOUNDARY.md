# cAPI Hosted MCP Security Boundary

Status: **source contract; deployed runtime must be verified separately**

This document records the security boundary introduced by cAPI commit `eb38524268cc3b4bcc767b4c8ce7794c91c777c9` so future changes do not accidentally restore ambient host execution or unauthenticated direct forwarding.

## Responsibility

cAPI is the governed connection/discovery/capability-negotiation layer. It is **not** the final consequence authority. Consequence-bearing requests must remain subject to CAPPO authorization and the governed execution boundary.

## Hosted production rules

1. `local-process` MCP is disabled in production.
2. MCP registry inventory and registration are administrative operations and require the Covenant admin token.
3. Direct `/api/proxy/{serverId}/...` access is internal service-to-service only and requires `BYOS_INTERNAL_API_KEY`.
4. Missing internal auth configuration fails closed; it must never silently make the proxy public.
5. cAPI internal authentication credentials are not forwarded to registered upstream services.
6. A spawned development MCP child must never inherit the complete cAPI service environment.

## Non-production local-process MCP

Local stdio MCP may be enabled only when both conditions are true:

- the runtime is not production; and
- `CAPI_ALLOW_LOCAL_PROCESS_MCP=true` is set explicitly.

When enabled, the child receives only a minimal runtime environment needed to start plus descriptor-specific values deliberately supplied for that local development process. Service secrets from the parent environment are not implicitly inherited.

## Remote MCP

Hosted cAPI should use remote MCP transports for actual service connections. Discovery/connection does not itself grant permission for a consequential operation.

## Direct proxy rule

The direct proxy is a transport helper, not an authority boundary. Because a direct call does not itself prove that CAPPO authorized the consequence, it is restricted to authenticated internal traffic and must not become a public alternate execution API.

## Required deployment verification

After any deployment affecting these paths, verify at minimum:

- unauthenticated `GET /api/mcp/servers` is rejected;
- unauthenticated `POST /api/mcp/servers` is rejected before any server start;
- authenticated production registration of `local-process` is rejected;
- direct proxy requests without the internal key are rejected;
- valid internal proxy calls do not forward the internal cAPI key upstream;
- no alternate public route re-exposes MCP registration or direct forwarding.

Do not infer deployed safety from the default branch alone. Record the exact deployed commit and negative-test results before marking the boundary verified live.
