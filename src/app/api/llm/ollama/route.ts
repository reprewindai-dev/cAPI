import { NextRequest, NextResponse } from "next/server";

// Enterprise-grade Ollama zero-config proxy for Qwen
// Defaults to the local Hetzner Coolify host networking, or localhost as fallback
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:3b";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt = body.prompt;
    const model = body.model || DEFAULT_MODEL;
    const stream = body.stream ?? false;

    if (!prompt) {
      return NextResponse.json({ error: "Missing 'prompt' in request body" }, { status: 400 });
    }

    // Ping Ollama to ensure it is alive before executing
    try {
      await fetch(`${OLLAMA_HOST}/api/version`, { method: "GET", signal: AbortSignal.timeout(2000) });
    } catch (e) {
      return NextResponse.json({ 
        error: "OLLAMA_UNREACHABLE", 
        message: `Could not connect to Ollama at ${OLLAMA_HOST}. Ensure it is running.`,
        details: (e as Error).message
      }, { status: 503 });
    }

    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        stream: stream,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({ 
        error: "OLLAMA_API_ERROR", 
        message: `Ollama returned status ${response.status}`,
        details: errText
      }, { status: response.status });
    }

    if (stream) {
      // Return the raw stream back to the client
      return new NextResponse(response.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    const data = await response.json();
    return NextResponse.json({
      status: "success",
      model: data.model,
      response: data.response,
      eval_count: data.eval_count,
      eval_duration: data.eval_duration
    });

  } catch (error: any) {
    console.error("[OLLAMA PROXY ERROR]", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to communicate with Ollama service", details: error.message },
      { status: 500 }
    );
  }
}
