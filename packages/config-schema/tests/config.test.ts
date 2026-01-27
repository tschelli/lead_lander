import path from "path";
import { describe, expect, it } from "vitest";
import { loadConfig, resolveLandingPageBySlugs } from "../src";

const configDir = path.resolve(__dirname, "../../../configs");

describe("config validation", () => {
  it("loads sample config and resolves a landing page", () => {
    const config = loadConfig(configDir);
    const resolved = resolveLandingPageBySlugs(config, "northwood-tech", "medical-assistant");

    expect(resolved).not.toBeNull();
    expect(resolved?.school.name).toContain("Northwood");
    expect(resolved?.program.name).toContain("Medical");
  });
});
