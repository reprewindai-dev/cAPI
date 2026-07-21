import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VeklomMCPAPIIntegration } from "./mcpapi-veklom-integration";

describe("VeklomMCPAPIIntegration settlement amounts", () => {
  const fetchMock = vi.fn();
  const integration = new VeklomMCPAPIIntegration();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([0.05, -1, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid amount_minor %s without sending a request",
    async (amount_minor) => {
      vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(
        integration.triggerX402Settlement("entry-hash", amount_minor),
      ).resolves.toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("accepts a valid amount_minor and sends integer minor units", async () => {
    await expect(
      integration.triggerX402Settlement("entry-hash", 50000),
    ).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls[0];
    expect(JSON.parse(request.body)).toMatchObject({
      pgl_hash: "entry-hash",
      amount_minor: 50000,
    });
  });
});
