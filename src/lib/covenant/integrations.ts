export class IntegrationUnavailable extends Error {
  readonly code = "INTEGRATION_UNAVAILABLE";
}

export function requireIntegration(name: string, value: string | undefined): string {
  if (!value?.trim()) throw new IntegrationUnavailable(`${name} integration is not configured`);
  return value.replace(/\/$/, "");
}

export async function postIntegration(url: string, body: unknown, headers: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new IntegrationUnavailable(`Integration returned HTTP ${response.status}`);
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new IntegrationUnavailable("Integration returned an invalid response");
  return result as Record<string, unknown>;
}
