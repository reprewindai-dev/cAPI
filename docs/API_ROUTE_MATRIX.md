# cAPI API route matrix

This matrix is generated from the route handlers under `src/app/api`. The
middleware in `src/middleware.ts` is the outer admission boundary for every
`/api` request. A route is not reachable anonymously unless it is explicitly
listed in the public lane.

| Route | Methods | Classification | Admission lane / rationale |
| --- | --- | --- | --- |
| `/api/adapters/qwen` | POST | INTERNAL | Internal service configuration; requires `BYOS_INTERNAL_API_KEY`. |
| `/api/agent/[id]` | POST, PUT | AUTHENTICATED | Operator agent administration; requires `COVENANT_ADMIN_TOKEN`. |
| `/api/audit` | GET | AUTHENTICATED | Operator audit read; requires `COVENANT_ADMIN_TOKEN`. |
| `/api/budget` | POST | AUTHENTICATED | Budget mutation; requires `COVENANT_ADMIN_TOKEN`. |
| `/api/capability/[id]` | PUT | AUTHENTICATED | Capability administration; requires `COVENANT_ADMIN_TOKEN`. |
| `/api/capi/v1/capabilities` | GET | AUTHENTICATED | cAPI capability discovery; requires `COVENANT_ADMIN_TOKEN`. |
| `/api/capi/v1/evidence/[id]` | GET | INTERNAL | PGL evidence lookup for internal callers; requires `BYOS_INTERNAL_API_KEY`. |
| `/api/capi/v1/execute` | POST | INTERNAL | Retired execution entrypoint; remains internal-only and returns its retirement response. |
| `/api/compose` | GET | AUTHENTICATED | Composition surface; requires `COVENANT_ADMIN_TOKEN`. |
| `/api/discover/[agentId]` | GET | INTERNAL | Agent discovery; requires `BYOS_INTERNAL_API_KEY`. |
| `/api/llm/ollama` | POST | INTERNAL | Inference service call; requires `BYOS_INTERNAL_API_KEY`. |
| `/api/mcp/servers` | GET, POST | AUTHENTICATED | MCP registry/admin operation; requires `COVENANT_ADMIN_TOKEN`. |
| `/api/mcp/sse` | GET | INTERNAL | MCP transport; requires `BYOS_INTERNAL_API_KEY`. |
| `/api/mount/authorize` | POST | CONSEQUENCE-AUTHORITY-NOT-HERE | Internal-only admission, but the authority-shaped decision belongs in CAPPO; cAPI must not add policy logic. |
| `/api/mount/discover` | GET | AUTHENTICATED | Mount discovery; requires `COVENANT_ADMIN_TOKEN`. |
| `/api/mount/execute` | POST | INTERNAL | Mount execution; requires `BYOS_INTERNAL_API_KEY`. |
| `/api/mount/register` | POST | AUTHENTICATED | Mount registration; requires `COVENANT_ADMIN_TOKEN`. |
| `/api/mount` | GET | AUTHENTICATED | Mount inventory; requires `COVENANT_ADMIN_TOKEN`. |
| `/api/ops/validate` | POST | INTERNAL | Operational validation/probing; requires `BYOS_INTERNAL_API_KEY`. |
| `/api/outly/intercept` | POST | INTERNAL | Outly integration decision path; requires `BYOS_INTERNAL_API_KEY`. |
| `/api/outly/outcome` | POST | INTERNAL | Outly outcome path; requires `BYOS_INTERNAL_API_KEY`. |
| `/api/pgl/[hash]` | GET | INTERNAL | Ledger proof lookup; requires `BYOS_INTERNAL_API_KEY`. |
| `/api/policy/[id]` | POST, PUT | AUTHENTICATED | Policy administration; requires `COVENANT_ADMIN_TOKEN`. |
| `/api/proxy/[serverId]/[...path]` | GET, POST, PUT, DELETE, PATCH | INTERNAL | Direct service proxy; requires `BYOS_INTERNAL_API_KEY`. |
| `/api/quarantine/[id]` | POST | AUTHENTICATED | Quarantine mutation; requires `COVENANT_ADMIN_TOKEN`. |
| `/api/replay/[hash]` | GET | INTERNAL | Evidence replay; requires `BYOS_INTERNAL_API_KEY`. |
| `/api/request` | POST | INTERNAL | Governed request ingress; requires `BYOS_INTERNAL_API_KEY`. |
| `/api/state` | GET | AUTHENTICATED | Runtime state inspection; requires `COVENANT_ADMIN_TOKEN`. |
| `/api/v1/registry/heartbeat` | POST | INTERNAL | Service liveness update; requires `BYOS_INTERNAL_API_KEY`. |
| `/api/v1/registry/register` | POST | INTERNAL | Service self-registration; requires `BYOS_INTERNAL_API_KEY`. |
| `/api/v1/registry/services/[service_name]/heartbeat` | POST | INTERNAL | Service liveness update; requires `BYOS_INTERNAL_API_KEY`. |
| `/api/v1/registry/services/[service_name]` | GET, DELETE | AUTHENTICATED | Registry inventory/deletion; requires `COVENANT_ADMIN_TOKEN`. |
| `/api/v1/registry/services` | GET | AUTHENTICATED | Registry inventory; requires `COVENANT_ADMIN_TOKEN`. |
| `/api/well-known/ai-catalog.json` | GET | PUBLIC | Static read-only discovery document; only GET/HEAD are admitted. |
| `/api/x402` | GET | PUBLIC | Read-only payment/discovery metadata; only GET/HEAD are admitted. |

`PUBLIC` is intentionally limited to the static AI catalog and read-only x402
metadata. No POST, PUT, PATCH, or DELETE is admitted through that lane.
