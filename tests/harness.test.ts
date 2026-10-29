// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const settings = JSON.parse(readFileSync(".claude/settings.json", "utf8"));
const mcp = JSON.parse(readFileSync(".mcp.json", "utf8"));
const agents = readFileSync("AGENTS.md", "utf8");

describe("Agent harness", () => {
  it("blocks reading .env files", () => {
    expect(settings.permissions.deny).toEqual(
      expect.arrayContaining(["Read(./.env)", "Read(./.env.*)"]),
    );
  });

  it("allows the test, lint and typecheck commands", () => {
    expect(settings.permissions.allow).toEqual(
      expect.arrayContaining([
        "Bash(npm test)",
        "Bash(npm run lint)",
        "Bash(npm run typecheck)",
      ]),
    );
  });

  it("configures the shadcn, docs, Supabase and Vercel MCP servers", () => {
    expect(Object.keys(mcp.mcpServers).sort()).toEqual([
      "next-devtools",
      "shadcn",
      "supabase",
      "vercel",
    ]);
  });

  // Module 2 part 2 has Claude apply a migration and seed the table, so the
  // Supabase server must not be scoped read-only. Leaving project_ref off
  // keeps the account tools, which is how Claude creates the project.
  it("gives the Supabase MCP server write access", () => {
    expect(mcp.mcpServers.supabase.url).toBe("https://mcp.supabase.com/mcp");
  });

  it("CLAUDE.md uses the same rules as AGENTS.md", () => {
    expect(readFileSync("CLAUDE.md", "utf8").trim()).toBe("@AGENTS.md");
  });

  it.each([
    "Plan before coding",
    "npm test",
    "components/ui",
    "lib/ai/call.ts",
    ".env",
    "conflicting or outdated facts in the Product Bible",
    "specs/*/tests",
  ])("AGENTS.md covers %s", (rule) => {
    expect(agents).toContain(rule);
  });
});
