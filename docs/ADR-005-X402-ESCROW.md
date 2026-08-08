# ADR-005: x402 Settlement Escrow (Design & Threat Model)

## Status
**ACCEPTED FOR DESIGN — IMPLEMENTATION BLOCKED PENDING SECURITY AND DEPLOYMENT APPROVAL.**

This ADR is a cross-platform architecture record. **cAPI does not own settlement or escrow implementation.** x402 ownership is being normalized under issue #32 so each responsibility has one canonical owner and duplicate implementations are explicitly classified as adapter, compatibility, demo, deprecated, or archive.

## Trust boundary clarification

A successful x402 payment or settlement is **not** proof that a capability worked. External trust/verification must bind the complete lifecycle:

`challenge → verified payment → authority/governance → capability execution → contract-valid output → durable evidence/receipt → replay protection`

TLS, route existence, HTTP 402 behavior, or payment settlement alone must never be presented as execution verification.

## Pre-packet decisions required
Before an implementation packet may be created, the following must be decided and recorded:
1. target chain and rationale;
2. settlement asset and minor-unit decimals;
3. CAPPO authorization/receipt format and signature verification;
4. VNP evidence trust model and freshness window;
5. admin and upgrade controls;
6. pause and recovery model;
7. audit plan;
8. testnet plan and success criteria;
9. key custody and rotation;
10. canonical repository ownership for payment verification, settlement persistence, capability authorization, evidence, pricing/discovery, and escrow client integration.

## Required settlement design
1. **Lifecycle.** Explicit states such as `CREATED → FUNDED → AUTHORIZED → RELEASED`, with `REFUNDED` / `EXPIRED` terminal branches.
2. **Roles.** Payer, payee, and authorizer with least privilege; no role may authorize and release to itself.
3. **Replay protection.** Unique idempotency key/nonce bound to the originating governed execution/evidence identifier.
4. **Timeout/refund.** Deterministic expiry and permissionless refund after expiry so funds cannot remain stuck indefinitely.
5. **Authorization.** Release requires a valid scoped CAPPO authorization/receipt for the bound execution and amount.
6. **Delivery evidence.** Where settlement depends on delivery, signed execution/output evidence must be validated before release.
7. **Evidence binding.** State transitions must be linked to the governed execution evidence chain.
8. **Threat model.** Reentrancy, integer errors, replay, front-running, stuck-fund griefing, key compromise, evidence/oracle spoofing, and upgrade/admin abuse.
9. **Testing.** Unit, invariant/property, fuzz, access-control, replay/idempotency, fork/testnet, and full legal-state-transition coverage.
10. **Deployment.** Audit sign-off, testnet-first, reproducible builds, verified source, documented admin controls, pinned chain/asset, and production relayer deployment on the approved Veklom stack.

## External verification contract
Any external directory or verifier evaluating a Veklom paid capability should be able to prove all of the following from one test transaction:

- capability id + version were known before payment;
- payment challenge terms were live and authoritative;
- payment proof was validated and single-use;
- governance authorized the exact request;
- the advertised capability actually executed;
- returned output satisfied the capability contract;
- output hash and execution evidence are durable;
- receipt verification detects tampering/replay;
- denied/failed execution cannot produce a false success receipt.

## Consequences
- Approval of this ADR does **not** authorize Solidity implementation or deployment.
- Escrow remains a separate audited effort if/when explicitly authorized.
- cAPI hosts this ADR as a cross-platform record; record location does not imply implementation ownership.
- No duplicate pricing manifest, demo settlement engine, or archived PayAPI router may present itself as an authoritative production implementation.
- Follow issue #32 for canonical ownership and cross-repo cleanup; BYOS issues #173/#174 track the real paid-execution verification path and retirement of catalog-era PayAPI behavior.
