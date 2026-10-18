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
9. cAPI-controlled OpenAPI requests must bind their socket lookup to an address that passed policy validation and must not follow an unvalidated redirect.
10. Unsupported or not-yet-policy-bindable remote transport types fail closed rather than registering an endpoint that the execution driver cannot safely honor.

## Non-production local-process MCP

Local stdio MCP may be enabled only when both conditions are true:

- the runtime is not production; and
- `CAPI_ALLOW_LOCAL_PROCESS_MCP=true` is set explicitly.

When enabled, the child receives only a minimal runtime environment needed to start plus descriptor-specific values deliberately supplied for that local development process. Service secrets from the parent environment are not implicitly inherited.

## Remote MCP

The remote URL is not authority. It is untrusted input even when supplied by an authenticated administrator. A target must be canonicalized, matched against the server-controlled allowlist, resolved, and rejected if any resolved address is local/private/link-local/metadata/reserved. Client-visible errors must remain sanitized; transport/DNS details belong in server-side diagnostics.

OpenAPI discovery requests use the validated DNS result for the actual socket lookup. The original hostname remains the HTTP Host/TLS SNI identity, but a later attacker-controlled DNS answer cannot replace the address that passed policy validation.

`remote-sse` is currently disabled in every environment. The MCP SDK owns initial SSE connection, reconnect, redirect, and message-POST networking; until every one of those operations can be forced through the same address-pinning boundary, cAPI must fail closed rather than expose an incompletely governed transport.

## Direct proxy rule

The direct proxy is a transport helper, not an authority boundary. Because a direct call does not itself prove that CAPPO authorized the consequence, it is restricted to authenticated internal traffic and must not become a public alternate execution API.

The direct proxy route is retired on `main`: every method on `/api/proxy/{serverId}/...` answers `410 LEGACY_EXECUTION_ENTRYPOINT_RETIRED` and performs no outbound request.

## rc1 Interlink bridge

The rc1 Interlink bridge forwards only Discovery/Mount traffic to CAPPO: `GET /api/v1/capi/interlink/capability/packages`, `POST /api/v1/capi/interlink/capability/mounts`, `GET /api/v1/capi/interlink/capability/mounts/{id}`, and `POST /api/v1/capi/interlink/capability/mounts/{id}/actions`. Execute and terminate are never bridged; consequence authority remains exclusively on CAPPO.

## Required deployment verification

After any deployment affecting these paths, verify at minimum:

- unauthenticated `GET /api/mcp/servers` is rejected;
- unauthenticated `POST /api/mcp/servers` is rejected before any server start;
- authenticated production registration of `local-process` is rejected;
- `remote-sse` execution fails closed until all SDK network operations are policy-bound;
- unsupported `remote-http` registration is rejected until a governed implementation exists;
- production remote registration fails closed when `CAPI_MCP_ALLOWED_HOSTS` is not configured;
- loopback/private/link-local/metadata targets and DNS-to-private targets are rejected;
- OpenAPI connections use only the vetted DNS address and cannot pivot through a second DNS resolution;
- OpenAPI redirects cannot pivot to forbidden destinations;
- direct proxy requests without the internal key are rejected;
- valid internal proxy calls do not forward the internal cAPI key upstream;
- client-visible registry errors do not disclose internal hostnames, ports, filesystem paths, or raw transport errors;
- no alternate public route re-exposes MCP registration or direct forwarding.

Do not infer deployed safety from the default branch alone. Record the exact deployed commit and negative-test results before marking the boundary verified live.
