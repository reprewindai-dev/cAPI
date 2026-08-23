# cAPI API route matrix

This matrix is generated from the route handlers under `src/app/api`. The
middleware in `src/middleware.ts` is the outer admission boundary for every
`/api` request. A route is not reachable anonymously unless it is explicitly
listed in the public lane.

| Route | Methods | Classification | Admission lane / rationale |
| --- | --- | --- | --- |
| `/api/adapters/qwen` | POST | INTERNAL | Internal service configuration; requires `BYOS_INTERNAL_API_KEY`. |
| `/api/agent/[id]` | POST, PUT | ADMIN | Operator agent administration; requires `COVENANT_ADMIN_TOKEN` only. |
| `/api/audit` | GET | AUTHENTICATED | Operator audit read; accepts either the ADMIN lane (`COVENANT_ADMIN_TOKEN`) or INTERNAL lane (`BYOS_INTERNAL_API_KEY`). |
| `/api/budget` | POST | ADMIN | Budget mutation; requires `COVENANT_ADMIN_TOKEN` only. |
| `/api/capability/[id]` | PUT | ADMIN | Capability administration; requires `COVENANT_ADMIN_TOKEN` only. |
| `/api/capi/v1/capabilities` | GET | AUTHENTICATED | cAPI capability discovery; accepts either authenticated credential lane. |
| `/api/capi/v1/evidence/[id]` | GET | INTERNAL | PGL evidence lookup for internal callers; requires `BYOS_INTERNAL_API_KEY`. |
| `/api/capi/v1/execute` | POST | INTERNAL | Retired execution entrypoint; remains internal-only and returns its retirement response. |
| `/api/compose` | GET | AUTHENTICATED | Composition read surface; accepts either authenticated credential lane. |
| `/api/discover/[agentId]` | GET | INTERNAL | Agent discovery; requires `BYOS_INTERNAL_API_KEY`. |
| `/api/llm/ollama` | POST | INTERNAL | Inference service call; requires `BYOS_INTERNAL_API_KEY`. |
| `/api/mcp/servers` | GET, POST | ADMIN | MCP registry/admin operation; requires `COVENANT_ADMIN_TOKEN` only. |
| `/api/mcp/sse` | GET | INTERNAL | MCP transport; requires `BYOS_INTERNAL_API_KEY`. |
| `/api/mount/authorize` | POST | CONSEQUENCE-AUTHORITY-NOT-HERE | Internal-only admission, but the authority-shaped decision belongs in CAPPO; cAPI must not add policy logic. |
| `/api/mount/discover` | GET | AUTHENTICATED | Mount discovery; accepts either authenticated credential lane. |
| `/api/mount/execute` | POST | INTERNAL | Mount execution; requires `BYOS_INTERNAL_API_KEY`. |
| `/api/mount/register` | POST | ADMIN | Mount registration; requires `COVENANT_ADMIN_TOKEN` only. |
| `/api/mount` | GET | AUTHENTICATED | Mount inventory; accepts either authenticated credential lane. |
| `/api/ops/validate` | POST | INTERNAL | Operational validation/probing; requires `BYOS_INTERNAL_API_KEY`. |
| `/api/outly/intercept` | POST | INTERNAL | Outly integration decision path; requires `BYOS_INTERNAL_API_KEY`. |
| `/api/outly/outcome` | POST | INTERNAL | Outly outcome path; requires `BYOS_INTERNAL_API_KEY`. |
| `/api/pgl/[hash]` | GET | INTERNAL | Ledger proof lookup; requires `BYOS_INTERNAL_API_KEY`. |
| `/api/policy/[id]` | POST, PUT | ADMIN | Policy administration; requires `COVENANT_ADMIN_TOKEN` only. |
| `/api/proxy/[serverId]/[...path]` | GET, POST, PUT, DELETE, PATCH | INTERNAL | Direct service proxy; requires `BYOS_INTERNAL_API_KEY`. |
| `/api/quarantine/[id]` | POST | ADMIN | Quarantine mutation; requires `COVENANT_ADMIN_TOKEN` only. |
| `/api/replay/[hash]` | GET | INTERNAL | Evidence replay; requires `BYOS_INTERNAL_API_KEY`. |
| `/api/request` | POST | INTERNAL | Governed request ingress; requires `BYOS_INTERNAL_API_KEY`. |
| `/api/state` | GET | AUTHENTICATED | Runtime state inspection; accepts either authenticated credential lane. |
| `/api/v1/registry/heartbeat` | POST | INTERNAL | Service liveness update; requires `BYOS_INTERNAL_API_KEY`. |
| `/api/v1/registry/register` | POST | INTERNAL | Service self-registration; requires `BYOS_INTERNAL_API_KEY`. |
| `/api/v1/registry/services/[service_name]/heartbeat` | POST | INTERNAL | Service liveness update; requires `BYOS_INTERNAL_API_KEY`. |
| `/api/v1/registry/services/[service_name]` | GET | AUTHENTICATED | Registry item read; accepts either credential lane. |
| `/api/v1/registry/services/[service_name]` | DELETE | ADMIN | Registry item deletion; requires `COVENANT_ADMIN_TOKEN` only. |
| `/api/v1/registry/services` | GET | AUTHENTICATED | Registry inventory; accepts either authenticated credential lane. |
| `/api/well-known/ai-catalog.json` | GET | PUBLIC | Static read-only discovery document; only GET/HEAD are admitted. |
| `/api/x402` | GET | PUBLIC | Read-only payment/discovery metadata; only GET/HEAD are admitted. |

`PUBLIC` is intentionally limited to the static AI catalog and read-only x402
metadata. No POST, PUT, PATCH, or DELETE is admitted through that lane.

`ADMIN` is the classification for registry/MCP administration and mutation
handlers and means `COVENANT_ADMIN_TOKEN` only. `INTERNAL` means
`BYOS_INTERNAL_API_KEY` only. `AUTHENTICATED` means either credential in its
own header: the admin bearer or `x-covenant-admin-token`, or `x-api-key`.

The `/api/x402` response advertises prices, but no handler in this repository
currently reads `X-PAYMENT` or returns `402`. Those prices are therefore
unenforced metadata. The protected routes use credential admission rather than
an x402 payment lane; introducing payment enforcement is a separate product
decision.
