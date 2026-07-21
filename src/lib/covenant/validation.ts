import { z } from "zod";

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const boundedRecord = z.record(z.string().max(128), z.unknown()).superRefine((value, ctx) => {
  if (Object.keys(value).length > 64) ctx.addIssue({ code: "custom", message: "Too many object properties" });
});
const isoDate = z.string().datetime({ offset: true });

export const executeInputSchema = z.object({
  connection_id: boundedString(128),
  agent_id: boundedString(128),
  capability_id: boundedString(256),
  action: boundedString(256),
  input: boundedRecord.default({}),
  snapshot_hash: boundedString(256).optional(),
  snapshot_signature: boundedString(1024).optional(),
  reauthorize_required: z.boolean().optional(),
  capability_version_mismatch: z.boolean().optional(),
}).strict();

const actorIdentitySchema = z.object({
  actor_id: boundedString(128),
  actor_type: z.enum(["agent", "user", "service"]),
  public_key: boundedString(2048).nullable().optional(),
}).strict();

const requestedSideEffectSchema = z.object({
  action: boundedString(256),
  description: boundedString(2048),
  lane: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  amount_minor: z.number().int().nonnegative().max(1_000_000_000).nullable().optional(),
  currency: boundedString(16).regex(/^[A-Z]{3}$/).nullable().optional(),
  parameters: boundedRecord.optional(),
}).strict();

const outlyEnvelope = {
  workspace_id: boundedString(128),
  tenant_id: boundedString(128),
  connection_id: boundedString(128),
  connection_version: boundedString(64),
  action_id: boundedString(128),
  execution_id: boundedString(128),
  capability_id: boundedString(256),
  capability_version: boundedString(64),
  policy_version: boundedString(64),
  nonce: boundedString(256),
  idempotency_key: boundedString(256),
  timestamp: isoDate,
};

export const proposedActionSchema = z.object({
  ...outlyEnvelope,
  actor_identity: actorIdentitySchema,
  expires_at: isoDate,
  requested_side_effect: requestedSideEffectSchema,
}).strict();

const evidenceReferenceSchema = z.object({
  evidence_id: boundedString(256),
  entry_hash: boundedString(256),
  ledger: boundedString(128),
}).strict();

export const outcomeSchema = z.object({
  ...outlyEnvelope,
  decision: z.enum(["ALLOW", "DENY", "MODIFY", "HUMAN_REVIEW"]),
  outcome_status: z.enum(["SUCCEEDED", "FAILED", "PARTIALLY_SUCCEEDED", "NOT_EXECUTED"]),
  evidence_reference: evidenceReferenceSchema,
  result_reference: z.object({
    output_hash: boundedString(256).nullable().optional(),
    error_code: boundedString(128).nullable().optional(),
  }).strict().nullable().optional(),
}).strict();

export const budgetSchema = z.object({
  agent_id: boundedString(128),
  capability_id: boundedString(256),
  budget: z.number().finite().nonnegative().max(1_000_000_000),
}).strict();

const policyRuleSchema = z.object({
  rule_id: boundedString(128),
  effect: z.enum(["allow", "deny"]),
  principal: boundedString(256),
  action: boundedString(256),
  conditions: z.object({
    time_window: z.tuple([boundedString(64), boundedString(64)]).optional(),
    rate_limit: z.number().int().positive().max(1_000_000).optional(),
    requires_approval: z.boolean().optional(),
    approval_path: boundedString(256).optional(),
    context_required: z.array(boundedString(128)).max(32).optional(),
    trust_minimum: z.number().min(0).max(100).optional(),
  }).strict(),
}).strict();

export const policyUpdateSchema = z.object({
  policy_name: boundedString(256),
  version: boundedString(64),
  tier: z.enum(["system", "owner", "runtime"]),
  created_by: boundedString(128).optional(),
  created_at: isoDate.optional(),
  rules: z.array(policyRuleSchema).max(256),
  metadata: z.object({
    enforcement_mode: z.enum(["strict", "warn", "audit-only"]).optional(),
    escalation_threshold: z.number().finite().min(0).max(100).optional(),
    audit_trail: z.boolean().optional(),
  }).strict().optional(),
}).strict();

export const policyToggleSchema = z.object({ enabled: z.boolean() }).strict();

const contextSchema = z.object({
  trace_id: boundedString(256).optional(),
  user_context: boundedRecord.optional(),
  audit_tags: z.array(boundedString(64)).max(32).optional(),
}).strict();

const signedRequestSchema = z.object({
  connection_id: boundedString(128),
  agent_id: boundedString(128),
  agent_signature: boundedString(4096),
  capability_id: boundedString(256),
  action: boundedString(256),
  input: boundedRecord,
  context: contextSchema,
  timestamp: isoDate,
}).strict();

const serverCallSchema = z.object({
  agent_id: boundedString(128),
  capability_id: boundedString(256),
  action: boundedString(256),
  input: boundedRecord.default({}),
  context: contextSchema.optional(),
  approvals: z.array(boundedString(256)).max(32).optional(),
  tamper: z.boolean().optional(),
}).strict();

export const requestInputSchema = z.union([signedRequestSchema, serverCallSchema]);

export function parseJson<T>(value: unknown, schema: z.ZodType<T>): { data: T } | { error: string } {
  const result = schema.safeParse(value);
  return result.success ? { data: result.data } : { error: result.error.issues.map((issue) => issue.path.join(".") + ": " + issue.message).join("; ") };
}

export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<{ data: T } | { error: string }> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 256_000) return { error: "Request body exceeds 256KB limit" };
  try {
    return parseJson(await request.json(), schema);
  } catch {
    return { error: "Request body must be valid JSON" };
  }
}
