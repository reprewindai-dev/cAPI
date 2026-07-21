import type { ProposedActionV1, DecisionV1, CappoAuthorizationReference } from "./outly-types";
import { IntegrationUnavailable, requireIntegration } from "./integrations";

/**
 * Deterministic Gate for Outly Shadow-Mode
 * Evaluates the ProposedActionV1 and returns a DecisionV1.
 */
export async function evaluateProposedAction(action: ProposedActionV1): Promise<DecisionV1> {
  const timestamp = new Date().toISOString();
  // Expires in 15 minutes
  const expires_at = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  let decision: DecisionV1['decision'] = 'ALLOW';
  let human_review_required = false;
  let cappo_authorization_reference: CappoAuthorizationReference | null = null;
  let modifications = undefined;

  const { lane, amount_minor } = action.requested_side_effect;

  // Basic Policy Logic
  if (lane === 1) {
    // Lane 1: Low risk, auto-allow
    decision = 'ALLOW';
  } else if (lane === 2) {
    // Lane 2: Medium risk, human review recommended or budget check
    decision = 'HUMAN_REVIEW';
    human_review_required = true;
    if (amount_minor && amount_minor > 100000) {
      // Over $1000 requires modification or deny
      decision = 'MODIFY';
      modifications = [
        {
          field: 'requested_side_effect.amount_minor',
          value: 100000,
          reason: 'Amount exceeds Lane 2 budget cap. Modifying to maximum allowed ($1000).',
        }
      ];
    }
  } else if (lane === 3) {
    // Lane 3: High risk, REQUIRES CAPPO Consult
    human_review_required = true;
    
    const authorization = await requestCappoAuthorization(action);

    if (authorization) {
      decision = 'ALLOW';
      cappo_authorization_reference = authorization;
    } else {
      decision = 'DENY';
    }
  } else {
    decision = 'DENY';
  }

  const decisionObj: DecisionV1 = {
    workspace_id: action.workspace_id,
    tenant_id: action.tenant_id,
    connection_id: action.connection_id,
    connection_version: action.connection_version,
    action_id: action.action_id,
    execution_id: action.execution_id,
    capability_id: action.capability_id,
    capability_version: action.capability_version,
    policy_version: action.policy_version,
    nonce: action.nonce,
    idempotency_key: action.idempotency_key,
    decision,
    modifications,
    human_review_required,
    cappo_authorization_reference,
    evidence_reference: null, // To be filled by PGL Evidence Anchoring later
    timestamp,
    expires_at,
  };

  return decisionObj;
}

async function requestCappoAuthorization(action: ProposedActionV1): Promise<CappoAuthorizationReference | null> {
  const base = requireIntegration("CAPPO decision", process.env.CAPPO_BACKEND_URL);
  const key = process.env.CAPPO_INTERNAL_EXEC_KEY?.trim();
  if (!key) throw new IntegrationUnavailable("CAPPO decision credentials are not configured");
  const response = await fetch(`${base.replace(/\/$/, "")}/api/v1/execution/authorize`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(action),
  });
  if (!response.ok) throw new IntegrationUnavailable(`CAPPO authorization failed with HTTP ${response.status}`);
  const body = await response.json() as { decision?: string; authorization_id?: string; lane?: 1 | 2 | 3; decision_hash?: string };
  if (body.decision !== "APPROVED" || !body.authorization_id) return null;
  return { authorization_id: body.authorization_id, lane: body.lane ?? 3, decision_hash: body.decision_hash };
}
