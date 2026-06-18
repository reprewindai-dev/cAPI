# Covenant

**The governed connection layer.** One call that discovers, authorizes, executes, proves, and learns.

MCP asks what an agent *can* do. APIs *do* it. Neither makes the call itself accountable. Covenant fuses both into a single governed connection — and seals a cryptographic proof every time.

> The connection is the asset.

---

## What it is

Covenant treats every agent→capability call as a **covenant**: a binding, verifiable agreement that runs through nine governed phases before any side effect happens, and leaves a tamper-evident proof behind.

```
agent (any model) ──▶ ◆ covenant · 9 governed phases ──▶ capability ──▶ ⛓ sealed proof → PGL
```

### The 9-phase pipeline

| # | Phase | What it decides |
|---|-------|-----------------|
| 1 | Identity & Security | Resolve agent, verify **Ed25519** signature, reject replays |
| 2 | Capability & Policy | Resolve capability, compose system/owner/runtime policies, compute effective permissions |
| 3 | Safety & Anomaly | Score the call against behavioral baselines; quarantine on high severity |
| 4 | Cost & Budget | Enforce per-agent budgets and overage policy |
| 5 | Approval | Hold for M-of-N human quorum when required |
| 6 | Execution | Invoke the capability, capture output |
| 7 | Evidence & Proof | Seal a **SHA-256 hash-chained** evidence record (who/what/when/why/how) |
| 8 | Audit & Compliance | Log, classify, set retention |
| 9 | Response | Update trust, return the verdict + proof |

## This is real, not a mock

- **Real cryptography** — Ed25519 keypairs per agent, canonical request signing, signature verification, and a SHA-256 hash-chained evidence ledger (each record links to the previous; the chain is replayable). See `src/lib/covenant/crypto.ts`.
- **Real policy engine** — three-tier composition (system → owner → runtime), conflict detection, deterministic resolution (system-wins, then most-restrictive), and live effective-permission calculation. See `src/lib/covenant/governance.ts`.
- **Real safety** — statistical anomaly detection vs. behavioral baselines (request spikes via μ+3σ, new-capability access, off-hours, failure spikes), trust suppression, quarantine, and approval quorum. See `src/lib/covenant/safety.ts`.
- **Real intelligence** — cost attribution + budgeting and a fused risk score (trust + anomalies + denials + budget pressure → threat level). See `src/lib/covenant/intelligence.ts`.
- Fully typed TypeScript, **no `any`**.

## The interface

The pipeline *is* the product. The app is an instrument panel, not a CRUD admin:

- **Console** — build a call, sign it, and watch all nine phases decide it in real time; expand any phase to see its reasoning. Override toggles (tamper signature, bypass policy/safety/cost) let you see each gate's effect.
- **Registry** — live capability discovery: "what can this agent do, right now?"
- **Agents** — trust + fused risk per agent, with suspend control.
- **Ledger** — the hash-chained evidence trail, with backward chain replay from any record.
- **Governance** — policy composition with enable/disable toggles and a live effective-permissions probe.
- **Safety** — anomaly feed and the quarantine queue with M-of-N approve/deny.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint     # eslint
```

The runtime seeds a realistic fleet (agents, capabilities, three-tier policies, cost models, baselines) and warms the ledger with signed traffic on first load, so every view is alive immediately.

## API

| Method | Route | Purpose |
|--------|-------|---------|
| `POST` | `/api/request` | Sign + run a call through the pipeline |
| `GET`  | `/api/state` | Full runtime snapshot |
| `GET`  | `/api/discover/{agentId}` | Capability discovery (effective permissions) |
| `GET`  | `/api/compose?agent_id&capability_id` | Policy composition + effective permissions |
| `GET`  | `/api/pgl/{hash}` | Retrieve an evidence record |
| `GET`  | `/api/replay/{hash}` | Walk the hash chain backwards |
| `POST` | `/api/quarantine/{id}` | Approve / deny a quarantined request |
| `POST` | `/api/policy/{id}` | Enable / disable a policy |
| `POST` | `/api/agent/{id}` | Toggle agent suspension |
| `POST` | `/api/budget` | Set an agent's budget for a capability |

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Framer Motion · Node `crypto`. Part of the **Veklom** ecosystem.

## Deployment

This project is fully ready to be deployed to a **Coolify** instance (e.g., hosted on Hetzner) using the provided `Dockerfile` or Nixpacks.

### Deploying to Coolify

1. Connect your repository to your Coolify instance.
2. Create a new Resource in Coolify and select **Project / Application**.
3. Choose the repository and branch.
4. Coolify will auto-detect the configuration. Under the **Build Pack** setting, select **Docker** (it should automatically pick up the `Dockerfile` at the root).
5. Ensure the **Port** is set to `3000`.
6. Deploy! The `Dockerfile` uses Next.js Standalone mode for a highly optimized, lightweight Node.js production image.
