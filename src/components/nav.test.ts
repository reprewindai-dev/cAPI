import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NAV } from "./nav";

const APP_DIR = join(process.cwd(), "src", "app");

describe("sidebar navigation", () => {
  it("never lists a page twice", () => {
    const hrefs = NAV.map((item) => item.href);
    const labels = NAV.map((item) => item.label.toLowerCase());
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("gives every entry a visible badge", () => {
    for (const item of NAV) expect(item.hint.trim(), item.label).not.toBe("");
  });

  it("only links to pages that exist", () => {
    for (const item of NAV) {
      const page = join(APP_DIR, item.href === "/" ? "" : item.href, "page.tsx");
      expect(existsSync(page), `${item.label} -> ${item.href}`).toBe(true);
    }
  });
});
