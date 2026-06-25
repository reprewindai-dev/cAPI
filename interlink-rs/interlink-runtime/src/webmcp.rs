pub const WEBMCP_UI: &str = r#"
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Amphoteric Runtime - WebMCP Dashboard</title>
    <style>
        body { font-family: sans-serif; background: #f0f2f5; color: #1c1e21; padding: 20px; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1 { color: #0066cc; }
        .tool-box { border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 4px; }
        .status { font-weight: bold; color: green; }
        .hitl-box { background: #fff3cd; border: 1px solid #ffeeba; padding: 15px; margin-top: 20px; display: none; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Amphoteric Runtime: Quinte West Edge</h1>
        <p>This UI is instrumented with <strong>WebMCP v2026</strong> for sovereign agentic orchestration.</p>

        <div class="status-box">
            Connection: <span class="status">Sovereign / Starlink Edge</span>
        </div>

        <section>
            <h2>1. Declarative WebMCP Tool</h2>
            <div class="tool-box">
                <p>An agent can fill this form natively using the <code>document.modelContext</code> interface.</p>
                <!-- Declarative WebMCP annotations -->
                <form id="contact-form" toolname="submit_feedback" tooldescription="Submits user feedback to the edge node">
                    <label>Feedback:</label><br>
                    <textarea name="feedback" rows="4" style="width:100%"></textarea><br>
                    <button type="submit">Submit Sovereign Feedback</button>
                </form>
            </div>
        </section>

        <section>
            <h2>2. Imperative WebMCP Tool</h2>
            <div class="tool-box">
                <button id="reg-btn">Register 'edge_diagnostics' Tool</button>
                <p id="reg-status">Status: Waiting for registration...</p>
            </div>
        </section>

        <div id="hitl-approval" class="hitl-box">
            <h3>Human-in-the-Loop Approval Required</h3>
            <p id="hitl-msg"></p>
            <button onclick="approveAction(true)">Approve Action</button>
            <button onclick="approveAction(false)">Deny Action</button>
        </div>
    </div>

    <script>
        // Check for WebMCP availability (Chrome 146+ flags)
        if (typeof document.modelContext !== 'undefined') {
            console.log("WebMCP detected via document.modelContext");

            // Register an Imperative Tool
            document.getElementById('reg-btn').addEventListener('click', async () => {
                try {
                    await document.modelContext.registerTool({
                        name: "get_edge_diagnostics",
                        description: "Retrieves local sensor data from the Quinte West edge node (Seked Prototype)",
                        inputSchema: {
                            type: "object",
                            properties: {
                                include_telemetry: { type: "boolean" }
                            }
                        },
                        execute: async (args) => {
                            console.log("Executing edge diagnostics...", args);
                            return {
                                temperature: "22C",
                                latency: "40ms (Starlink)",
                                location: "Trenton, ON"
                            };
                        }
                    });
                    document.getElementById('reg-status').innerText = "Status: 'edge_diagnostics' registered and discoverable by agent.";
                } catch (e) {
                    console.error("WebMCP Registration failed:", e);
                }
            });

            // Listen for tool execution (Human-in-the-loop simulation)
            document.addEventListener('toolchange', (e) => {
                console.log("Active tools changed:", e.detail);
            });
        } else {
            console.warn("WebMCP (document.modelContext) not found. Please enable flags in Chrome Canary.");
        }

        async function approveAction(approved) {
            document.getElementById('hitl-approval').style.display = 'none';
            // Logic to signal back to the agent/runtime
        }
    </script>
</body>
</html>
"#;
