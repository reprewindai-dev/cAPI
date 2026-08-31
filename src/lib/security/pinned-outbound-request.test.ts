import { describe, expect, it } from "vitest";
import { createPinnedLookup } from "./pinned-outbound-request";

describe("createPinnedLookup", () => {
  it("returns only the vetted address even when the connection asks to resolve the hostname again", async () => {
    const lookup = createPinnedLookup("93.184.216.34");

    const result = await new Promise<{ address: string; family: number }>((resolve, reject) => {
      lookup(
        "api.example.com",
        { family: 0, hints: 0, all: false },
        ((error: NodeJS.ErrnoException | null, address: string, family: number) => {
          if (error) {
            reject(error);
            return;
          }
          resolve({ address, family });
        }) as never,
      );
    });

    expect(result).toEqual({ address: "93.184.216.34", family: 4 });
    expect(result.address).not.toBe("10.0.0.8");
  });
});
