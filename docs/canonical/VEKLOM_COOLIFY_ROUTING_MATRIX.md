# Veklom Coolify Routing Matrix

Canonical routing contract for the Veklom services. Public hostnames and
internal ports below are directive values; live deployment evidence is not
asserted by this document.

| Logical name | Repo | Internal port | Public Traefik hostname | Health route | Dependency-health route | Protocol route | Auth mode | Key env vars | Upstream deps |
|---|---|---:|---|---|---|---|---|---|---|
| cAPI | `cAPI` | 3003 | `capi.veklom.com` (alias `interlink.veklom.com`) | `/health` | `/health/dependencies` | `/protocol.json`, `/protocol/introspect` | Bearer for protected integrations; registry token for registration; admin bearer for destructive registry mutation | `PORT`, `COVENANT_ADMIN_TOKEN`, `CAPI_REGISTRY_TOKEN`, `REDIS_URL`, `CAPPO_BACKEND_URL`, `PGL_LEDGER_URL`, `BYOS_MCP_GATEWAY_URL` | CAPPO, PGL, BYOS, optional lockerphycer; Redis |
| CAPPO | `cappo-backend` | 8002 | `cappo.veklom.com` | `/health` | `/health/dependencies` — **UNVERIFIED — needs live check** | `/protocol.json`, `/protocol/introspect` — **UNVERIFIED — needs live check** | **UNVERIFIED — needs live check** | `PORT`, `DATABASE_URL`, `REDIS_URL`, `PGL_LEDGER_URL` | Postgres, Redis, Ollama, PGL |
| gnomledger/PGL | `gnomledger` | 8001 | `pgl.veklom.com` | `/health` — **UNVERIFIED — needs live check** | `/health/dependencies` — **UNVERIFIED — needs live check** | `/protocol.json`, `/protocol/introspect` — **UNVERIFIED — needs live check** | **UNVERIFIED — needs live check** | **UNVERIFIED — needs live check** | Postgres |
| BYOS | `veklom-byos-backend` | 8088 | `api.veklom.com` | `/health` | `/health/dependencies` — **UNVERIFIED — needs live check** | `/protocol.json` — **UNVERIFIED — needs live check** | **UNVERIFIED — needs live check** | `PORT`, `DATABASE_URL`, `REDIS_URL`, `OLLAMA_BASE_URL` | Postgres, Redis, Ollama |
| lockerphycer | `lockerphycer` | 8092 | **UNVERIFIED — needs live check** | `/health` | `/health/dependencies` | `/protocol.json`, `/protocol/introspect` | Bearer | `PORT`, `CAPI_BACKEND_URL`, `CAPI_API_KEY`, `DATABASE_URL`, `REDIS_URL` | cAPI, Postgres, Redis |
| Postgres | N/A infrastructure | 5432 | N/A | **UNVERIFIED — needs live check** | N/A | N/A | Database credentials/TLS — **UNVERIFIED — needs live check** | `DATABASE_URL`, `POSTGRES_*` | N/A |
| Redis | N/A infrastructure | 6379 | N/A | **UNVERIFIED — needs live check** | N/A | N/A | Redis URL/auth — **UNVERIFIED — needs live check** | `REDIS_URL`, `REDIS_PASSWORD` | N/A |
| Ollama | N/A infrastructure | 11434 | N/A | **UNVERIFIED — needs live check** | N/A | N/A | **UNVERIFIED — needs live check** | `OLLAMA_BASE_URL`, `OLLAMA_HOST` | N/A |

## Verification boundary

- Ports and hostnames are the canonical deployment directive, not a claim
  that the live Coolify routing has been checked.
- Docker DNS names, running containers, image digests, health responses, and
  last-verified timestamps are **UNVERIFIED — needs live check** until checked
  against the live Coolify deployment.
- cAPI's implementation source for the rows it owns is in `src/app/health`,
  `src/app/protocol.json`, `src/app/protocol`, and
  `src/app/api/v1/registry`.
