import crypto from "crypto";

async function main() {
  console.log("🚀 Initializing Outly cAPI Test Harness...");

  // 1. Calculate "Next Friday at 10:00 AM"
  const now = new Date();
  const daysUntilFriday = (5 - now.getDay() + 7) % 7 || 7; // Ensure it's next Friday if today is Friday
  const nextFriday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilFriday);
  nextFriday.setHours(10, 0, 0, 0); // 10:00 AM

  console.log(`📅 Target Appointment Date: ${nextFriday.toLocaleString()}`);

  const payload = {
    workspace_id: "wksp_outly_demo",
    tenant_id: "tenant_acme_corp",
    connection_id: crypto.randomUUID(),
    connection_version: "1.0.0",
    action_id: crypto.randomUUID(),
    execution_id: crypto.randomUUID(),
    actor_identity: {
      actor_id: "agent-outly-scheduler",
      actor_type: "agent",
      public_key: "outly-demo-key"
    },
    capability_id: "cap-outly-schedule",
    capability_version: "1.0.0",
    policy_version: "1.0.0",
    nonce: crypto.randomBytes(16).toString("hex"),
    idempotency_key: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    requested_side_effect: {
      action: "schedule_appointment",
      description: "Book Outly consultation appointment for next Friday at 10:00 AM",
      lane: 1, // Lane 1 for auto-allow scheduling, Lane 2/3 for financial/critical ops
      parameters: {
        appointment_time: nextFriday.toISOString(),
        attendees: ["client@example.com", "outly-rep@example.com"]
      }
    }
  };

  console.log("\n📦 Payload Constructed:");
  console.log(JSON.stringify(payload, null, 2));

  console.log("\n📡 Submitting to cAPI (Governed Connection Layer) -> /api/outly/intercept");
  try {
    const response = await fetch("https://capi.veklom.com/api/outly/intercept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    console.log(`\n⚖️  cAPI Decision Status: ${response.status}`);
    
    if (response.ok) {
      console.log("✅ Intercept Successful. Decision:");
      console.log(JSON.stringify(result, null, 2));
      console.log(`\n🔒 Cryptographic Evidence Sealed in PGL!`);
      console.log(`PGL Entry Hash: ${result.evidence_reference?.entry_hash}`);
    } else {
      console.log("❌ Intercept Failed or Denied:");
      console.log(result);
    }
  } catch (error) {
    console.error("Failed to connect to cAPI. Ensure the cAPI server is running on localhost:3002.");
    console.error(error);
  }
}

main();
