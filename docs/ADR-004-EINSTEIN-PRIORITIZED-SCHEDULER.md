# ADR-004: Einstein Prioritized Scheduler (Placement & Design)

## Status
**Proposed — BLOCKED pending human authorization.** This ADR is preparation only. It selects **no** repository and contains **no** implementation. Per the canonical planning export, packet-001 is `NOT_STARTED` / `executionEligibility: BLOCKED` ("execution is currently blocked"), and the export is unsigned (`UNLOCKED_PLANNING_PHASE`, `approvedBy: NONE`). No scheduler code may be written and no repository may be chosen until this ADR is approved.

## Context
The canonical blueprint proposes an "Einstein-Markov Dynamic Task Prioritization Engine" for reputation-weighted priority routing of agent tasks. The planning packet targets `src/scheduler/einstein.rs` (Rust).

Two hard constraints govern this decision:

1. **Stack constraint (owner):** the ecosystem stays **Python (FastAPI) + TypeScript (Next.js/Node)**. No Rust/Go/Substrate migration without a separate, explicitly approved ADR. The `.rs` target in the packet is therefore **rejected** as a placement.
2. **Authority boundary (ADR-001/ADR-002):** scheduling is a *planning* concern, not an *authorization* concern. Placing scheduling authority in the ledger or in CAPPO would violate the established separation.

### Ownership boundary (must be preserved)
- **ABIDE** owns planning, task decomposition, and priority scheduling (the scheduler lives here conceptually).
- **CAPPO** authorizes consequential (Lane 3) execution. It is *not* the scheduler and must never be called to "schedule."
- **The runtime** executes only what CAPPO authorized.
- **PGL / Gnomledger** records scheduling inputs, the scheduling decision, and the outcome as evidence. It does **not** compute priority.

## Decision (to be ratified)
This ADR frames the decision; it does not make it. The scheduler is an **ABIDE-owned planning component** implemented in the existing stack. Candidate placements (to be chosen at approval time, not now):

| Option | Location | Language | Pros | Cons |
| --- | --- | --- | --- | --- |
| A | ABIDE service module | TypeScript/Node | Co-located with planning/graph synthesis; single planning authority | Node CPU-bound scoring at high QPS |
| B | ABIDE Python worker | Python/FastAPI+Celery | Matches BYOS worker patterns; easy numeric/Markov modeling; Celery for queueing | Cross-language boundary with TS planner |
| C | Shared library consumed by ABIDE | TS or Python package | Reusable, testable in isolation | Adds a package to maintain |

**Non-options (explicitly rejected):** `einstein.rs` / Rust; any placement inside Gnomledger/PGL; any placement inside CAPPO; any placement inside cAPI (cAPI is the interlink fabric gateway, not a planner — see ADR-002).

## Required design (must be specified before implementation)
Any approved implementation must define all of the following. This list is the acceptance contract for a future packet.

1. **Scoring model.** The priority function and its inputs (reputation, x402 collateralization ratio, capability-drift frequency, deadline/age). Must be deterministic given identical inputs and a fixed model version; the model version is recorded with every decision. "Einstein-Markov" transition weights, if used, are pinned per version.
2. **Deterministic tie-breaking.** A total order with a stable, reproducible tiebreak chain (e.g. score → earliest enqueue logical clock → task id) so equal scores never depend on wall-clock or map iteration order. Lamport/logical sequence numbers per ADR-001 evidence ordering.
3. **Dependency handling.** Tasks form a DAG; a task is eligible only when its dependencies are satisfied. Cyclic dependencies are rejected (kill-switch parity with the ABIDE compiler's cyclic-graph halt).
4. **Retries.** Bounded retry with backoff, a max-attempts cap, and idempotency keys so a retried task is not double-scheduled. Retry state is part of the recorded evidence.
5. **Starvation prevention.** Aging/priority boosting so low-priority eligible tasks eventually run; a documented fairness bound.
6. **CAPPO receipt validation.** For any consequential (Lane 3) task, the scheduler may *propose* but the runtime must present a valid CAPPO authorization (EAT/receipt) before execution. The scheduler verifies the receipt's signature, scope, and freshness/TTL and refuses to release Lane 3 work without an `APPROVED` result (fail-closed).
7. **Replayability.** Given the recorded inputs + pinned model version, the schedule is reproducible. Note the export's `plan-ir` is currently `replayable: false`; replayability is a target this ADR requires.
8. **Evidence recording.** Scheduling inputs, the decision (ordering + chosen task + score + model version), and the outcome are anchored to PGL/Gnomledger (SHA-256, hash-chained, consistent with the existing evidence-anchoring work).

## Consequences
- Approval of this ADR authorizes a follow-up implementation packet **in the existing Python/TS stack only**, at one of options A–C.
- Until approved, no scheduler code exists and no repository is designated as owner.
- This ADR does not constitute evidence that any scheduling capability is implemented or verified; the capability remains evidence-gated.
