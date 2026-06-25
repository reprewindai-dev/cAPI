# Amphoteric Runtime: The Sovereign Agentic Edge

The **Amphoteric Runtime** is a unified systems primitive designed for the 2026 developer paradigm. It collapses the boundary between human-facing UI, machine-readable APIs, and agentic tool contracts into a single, sovereign binary.

## The Amphoteric Philosophy
Just as an amphoteric molecule reacts as either an acid or a base depending on its environment, the Amphoteric Runtime dynamically adapts its persona based on the client:

1.  **Web Persona (`/ui`)**: Serves a browser-native interface instrumented with **WebMCP**. It allows local AI agents to orchestrate the UI via `document.modelContext` using Declarative and Imperative tool contracts.
2.  **API Persona (`/v2/call`)**: Serves high-performance JSON over HTTP for traditional deterministic clients.
3.  **MCP Persona (`/mcp`)**: Serves **JSON-RPC 2.0** for backend AI agents (e.g., Claude Desktop, Cursor) over STDIO or HTTP/SSE.

## Quinte West Deployment (2 Backends, 2 Edges)
Designed for the topographical complexity of Quinte West, Ontario:
- **Resilience**: Masks Starlink latency (40ms) by utilizing local WebMCP orchestration and edge-buffered execution.
- **Sovereignty**: Built on the **Veklom** ecosystem for decentralized, self-hosted infrastructure.
- **Safety**: Implements **Lockdown Mode**, **Toolset Slicing**, and **Push Protection** as first-class citizens.

## Key Primitives
- **Unified Tool Catalog**: Define a tool once; expose it to humans, APIs, and agents simultaneously.
- **Diglossia Persona**: Seamlessly translates between JSON-RPC (MCP) and REST-style (API) payloads.
- **Human-in-the-Loop (HITL)**: Integrated governance API ensures high-risk actions require explicit visual confirmation.

## Getting Started
```bash
cd interlink-runtime
cargo run
```

Access the WebMCP Dashboard at `http://127.0.0.1:8080/ui`.
Connect as an MCP Server at `http://127.0.0.1:8080/mcp`.
Invoke the Governed API at `http://127.0.0.1:8080/v2/call`.
