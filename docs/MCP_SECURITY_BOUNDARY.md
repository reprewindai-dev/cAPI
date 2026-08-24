# cAPI Hosted MCP Security Boundary

Status: **source contract; deployed runtime must be verified separately**

This document records the hosted MCP security boundary so future changes do not accidentally restore ambient host execution, unauthenticated direct forwarding, or arbitrary authenticated outbound network access.

## Responsibility

cAPI is the governed connection/discovery/capability-negotiation layer. It is **not** the final consequence authority. Consequence-bearing requests must remain subject to CAPPO authorization and the governed execution boundary.

## Hosted production rules

1. `local-process` MCP is disabled in production.
2. MCP registry inventory and registration are administrative operations and require the Covenant admin token.
3. Direct `/api/proxy/{serverId}/...` access is internal service-to-service only and requires `BYOS_INTERNAL_API_KEY`.
4. Missing internal auth configuration fails closed; it must never silently make the proxy public.
5. cAPI internal authentication credentials are not forwarded to registered upstream services.
6. A spawned development MCP child must never inherit the complete cAPI service environment.
7. Authentication does not make an arbitrary remote URL safe. Remote MCP/OpenAPI destinations must pass the outbound egress policy before registration and immediately before cAPI-controlled outbound requests.
8. Production remote targets require an explicit server-controlled `CAPI_MCP_ALLOWED_HOSTS` allowlist. Loopback, private, link-local, metadata, reserved, and DNS-to-private destinations are rejected.
9. cAPI-controlled OpenAPI/proxy fetches must not follow an unvalidated redirect to a different destination. Redirects are disabled unless every redirect hop is independently revalidated.
10. Unsupported remote transport types fail closed rather than registering an endpoint that the execution driver cannot honor.

## Non-production local-process MCP

Local stdio MCP may be enabled only when both conditions are true:

- the runtime is not production; and
- `CAPI_ALLOW_LOCAL_PROCESS_MCP=true` is set explicitly.

When enabled, the child receives only a minimal runtime environment needed to start plus descriptor-specific values deliberately supplied for that local development process. Service secrets from the parent environment are not implicitly inherited.

## Remote MCP

Hosted cAPI may use remote MCP transports only under the outbound egress policy above. Discovery/connection does not itself grant permission for a consequential operation.

The remote URL is not authority. It is untrusted input even when supplied by an authenticated administrator. A target must be canonicalized, matched against the server-controlled allowlist, resolved, and rejected if any resolved address is local/private/link-local/metadata/reserved. Client-visible errors must remain sanitized; transport/DNS details belong in server-side diagnostics.

The current source validates the initial remote-SSE destination. Deployment verification must additionally prove that the SDK transport cannot redirect a validated public endpoint to a forbidden address. Until that redirect behavior is proven fail-closed (or remote SSE is constrained accordingly), the remote-SSE redirect boundary remains **NOT_VERIFIED**.

## Direct proxy rule

The direct proxy is a transport helper, not an authority boundary. Because a direct call does not itself prove that CAPPO authorized the consequence, it is restricted to authenticated internal traffic and must not become a public alternate execution API.

A stored proxy destination is revalidated immediately before the outbound fetch. This is required because DNS and registry state can change after initial registration.

## Required deployment verification

After any deployment affecting these paths, verify at minimum:

- unauthenticated `GET /api/mcp/servers` is rejected;
- unauthenticated `POST /api/mcp/servers` is rejected before any server start;
- authenticated production registration of `local-process` is rejected;
- unsupported `remote-http` registration is rejected until a governed implementation exists;
- production remote registration fails closed when `CAPI_MCP_ALLOWED_HOSTS` is not configured;
- loopback/private/link-local/metadata targets and DNS-to-private targets are rejected;
- OpenAPI and direct-proxy redirects cannot pivot to forbidden destinations;
- direct proxy requests without the internal key are rejected;
- valid internal proxy calls do not forward the internal cAPI key upstream;
- client-visible registry/proxy errors do not disclose internal hostnames, ports, filesystem paths, or raw transport errors;
- no alternate public route re-exposes MCP registration or direct forwarding.

Do not infer deployed safety from the default branch alone. Record the exact deployed commit and negative-test results before marking the boundary verified live.
