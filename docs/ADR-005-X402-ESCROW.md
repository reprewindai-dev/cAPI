# ADR-005: x402 Settlement Escrow (Design & Threat Model)

## Status
**ACCEPTED FOR DESIGN — IMPLEMENTATION BLOCKED PENDING SECURITY AND DEPLOYMENT APPROVAL.**

The owner has approved the scope and threat-model direction of this design. Solidity implementation and deployment remain **blocked**. This ADR contains **no** Solidity and authorizes **no** deployment. No contract may be written, compiled, or deployed until (a) the pre-packet decisions below are made and recorded, and (b) a security + deployment approval and audit plan are in place, at which point a new authorized implementation packet may be issued.

Per the canonical planning export, packet-002 is `NOT_STARTED` / `executionEligibility: BLOCKED`, classified `UNVERIFIED_DESIGN_INTENT` ("Contracts do not exist on disk and have not been deployed to any testnet"), and the export is unsigned.

## Pre-packet decisions required (blockers to any implementation packet)
Before an implementation packet may be created, the following must be decided and recorded:
1. **Target chain** (e.g. Base / Arbitrum / other) and rationale.
2. **Settlement asset** (e.g. USDC) and its minor-unit decimals.
3. **CAPPO authorization format** — the exact receipt/EAT structure, signature scheme, and how the contract/relayer verifies it.
4. **VNP evidence trust model** — what VNP attests, who signs, and how the release path trusts/validates it.
5. **Admin and upgrade controls** — proxy/upgrade pattern (or immutability), who holds admin, timelock.
6. **Pause and recovery model** — emergency pause authority and stuck-fund recovery path.
7. **Audit plan** — auditor(s), scope, and the gate that must pass before mainnet.
8. **Testnet plan** — target testnet, test scenarios, and success criteria before mainnet.
9. **Key custody** — how authorizer/admin keys are generated, stored, and rotated.

## Context
The blueprint's "x402 Settles" doctrine (ADR-001) requires machine-to-machine settlement **strictly bound to executions**. Packet-002 proposes an escrow contract at `contracts/X402Escrow.sol` (Solidity, on-chain).

**Stack note:** unlike the scheduler (ADR-004), an on-chain escrow is inherently a smart contract and **cannot** be expressed in Python/TypeScript. This is therefore scoped as a **separate, audited Solidity effort** that does not alter the Python/TS services. The Python/TS side interacts with it only via a client (e.g. web3.py / viem) — the existing `triggerX402Settlement` path is the integration seam.

This ADR must be read alongside the governed issue "Replace simulated automatic x402 settlement triggering with CAPPO-authorized, execution-bound, idempotent settlement": settlement must be authorized, execution-bound, and idempotent regardless of whether the escrow is on-chain.

## Required design (must be specified before implementation)
1. **Lifecycle.** States and legal transitions, e.g. `CREATED → FUNDED → AUTHORIZED → RELEASED` with `REFUNDED` / `EXPIRED` terminal branches. No transition may skip authorization before release.
2. **Roles.** Payer, payee, and an authorizer bound to CAPPO authority. Least privilege; no single role can both authorize and release to itself. Role/key rotation story.
3. **Replay protection.** Each settlement carries a unique idempotency key / nonce bound to the originating execution (`pgl_hash`); re-submitting the same execution never double-releases. On-chain nonces + off-chain idempotency must agree.
4. **Timeout / refund behavior.** Funded-but-unauthorized escrows refund to the payer after a defined timeout; deterministic, permissionless-refund-after-expiry so funds are never stuck.
5. **Settlement authorization.** Release requires a valid CAPPO authorization (EAT/receipt) for the bound execution — signature, scope, amount, and TTL verified. Fail-closed: no `APPROVED` result ⇒ no release (parity with Lane 3 rule in ADR-002).
6. **VNP validation.** Where settlement depends on measured delivery, require signed VNP evidence/telemetry as a release precondition. Define what VNP attests and its freshness window.
7. **PGL evidence binding.** Every state transition (fund, authorize, release, refund) is anchored to PGL/Gnomledger with the execution's evidence hash, giving an auditable, hash-chained settlement lineage.
8. **Threat model.** At minimum: reentrancy, integer over/underflow (use checked math / Solidity ≥0.8), authorization replay, front-running of release/refund, griefing via stuck funds, key compromise of the authorizer, oracle/VNP spoofing, and upgrade/admin key abuse. Each threat maps to a mitigation.
9. **Testing strategy.** Unit + property/invariant tests (e.g. Foundry), fuzzing on amounts/nonces, reentrancy and access-control test suites, fork tests against the target chain, and 100% coverage of state transitions. Money is integer minor units end-to-end (matches `SettlementReferenceV1.amount_minor` / `amountMinor: BigInt!`).
10. **Deployment requirements.** External audit sign-off before any mainnet deploy; testnet-first; reproducible builds and verified source; documented admin keys / timelock / pause; target chain and settlement asset (USDC minor units) pinned; production runs on the owner's stack (Coolify/Hetzner) for the off-chain relayer, with the contract on the designated chain — **not** Vercel.

## Consequences
- Approval authorizes a **separate** Solidity implementation packet gated behind a security audit; it does not touch the Python/TS services beyond the settlement client seam.
- Until approved and audited, no contract exists, compiles, or deploys.
- This ADR is not evidence that escrow/settlement is implemented or verified; the capability remains evidence-gated (`UNVERIFIED_DESIGN_INTENT`).
