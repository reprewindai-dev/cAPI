export class IntegrationUnavailable extends Error {
  readonly code = "INTEGRATION_UNAVAILABLE";
}

export class AuthorityDenied extends Error {
  readonly code = "AUTHORITY_DENIED";
  readonly status = 403;
}

export function requireIntegration(name: string, value: string | undefined): string {
  if (!value?.trim()) throw new IntegrationUnavailable(`${name} integration is not configured`);
  return value.replace(/\/$/, "");
}

export async function postIntegration(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new AuthorityDenied(`Authority denied: HTTP ${response.status}`);
      }
      throw new IntegrationUnavailable(`Integration failed: HTTP ${response.status}`);
    }

    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new IntegrationUnavailable("Integration failed: invalid response");
    }

    return result as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AuthorityDenied || error instanceof IntegrationUnavailable) {
      throw error;
    }

    throw new IntegrationUnavailable(
      `Integration failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
