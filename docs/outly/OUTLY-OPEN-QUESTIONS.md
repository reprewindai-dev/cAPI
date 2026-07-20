# Outly Shadow-Mode Open Questions

These questions must be answered with the real Outly workflow before a pilot shape is defined. They are discovery questions, not implementation requirements or authorization.

## Proposed actions

1. Which exact Outly action or smallest set of actions should be shadowed first?
2. What is the action identifier that Outly can provide, and is it stable across retries?
3. What does Outly consider the requested side effect: a tool call, external API request, data mutation, payment, workflow transition, or another category?
4. Which actions are lane 1, lane 2, and lane 3 from Outly's perspective?
5. Are there actions that must never be shadowed because of safety, privacy, or commercial sensitivity?

## Identity and tenancy

6. What is Outly's actor identity model: agent, user, service, or a combination?
7. Which identifier is authoritative for the actor, workspace, tenant, and organization?
8. Can Outly provide a stable `workspace_id` and `tenant_id` on every proposal and outcome?
9. How should connection identity and `connection_version` be created, rotated, and invalidated?
10. How are capability identity and `capability_version` represented in Outly?
11. Which party signs proposals, and how should public keys or verification material be exchanged?

## Timing and retries

12. What latency tolerance does Outly have for an intercept decision?
13. What is the acceptable decision expiry window?
14. How does Outly retry a proposal, and which idempotency key remains stable across retries?
15. What replay behavior should Outly expect for an already-seen nonce or idempotency key?
16. What should happen if Veklom is unavailable: fail open, fail closed, or continue in an explicitly marked audit-only mode?

## Decision semantics

17. What exactly should `MODIFY` mean to Outly: modify parameters, route to another capability, reduce scope, cap amount, change timing, or something else?
18. Can Outly consume a structured list of modifications, and which fields are safe to modify?
19. What does `HUMAN_REVIEW` mean operationally, and who is the reviewer?
20. Does `DENY` prevent Outly execution, or is the first pilot strictly observational?
21. For a lane-3 action, what CAPPO authorization artifact can Outly correlate to the decision?

## Outcome reporting

22. How will Outly report that it executed, skipped, partially executed, or failed the proposed action?
23. What outcome statuses and error categories already exist in Outly?
24. Can Outly return an output hash or result reference without sending sensitive output data?
25. How soon after execution can Outly report the outcome?
26. How should an outcome correction or late-arriving outcome be represented?
27. What evidence reference does Outly already create, if any, and can it be linked to the Veklom decision?

## Evidence and audit

28. Which decision, proposal, and outcome fields must be retained?
29. What audit retention, deletion, and data-residency requirements apply?
30. Should evidence be anchored to gnomledger synchronously, asynchronously, or both?
31. What should the system report when gnomledger is unavailable?
32. Which fields are confidential and must not be treated as merely base64-encoded?
33. Which parties may read decision and outcome evidence?
34. What evidence receipt or ledger hash format can Outly consume?

## Pilot acceptance

35. What is the smallest safe design-partner pilot with no production side effects?
36. Which success metrics matter: decision latency, correlation rate, outcome-report rate, false positives, review burden, or evidence completeness?
37. Who signs off on the pilot boundary, and what evidence is required before moving beyond design preparation?
