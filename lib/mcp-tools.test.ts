import { describe, expect, test, vi } from "vitest";
import { findTool, toolsForScope, TOOL_REGISTRY } from "./mcp-tools";

describe("TOOL_REGISTRY", () => {
  test("contient exactement add_task pour ce lot", () => {
    expect(TOOL_REGISTRY.map((t) => t.tool.name)).toEqual(["add_task"]);
  });

  test("add_task requiert tasks:write", () => {
    const def = findTool("add_task");
    expect(def?.requiredScope).toBe("tasks:write");
  });
});

describe("findTool", () => {
  test("renvoie undefined pour un tool inconnu", () => {
    expect(findTool("delete_everything")).toBeUndefined();
  });
});

describe("toolsForScope", () => {
  test("filtre les tools selon le scope accorde - add_task visible avec tasks:write", () => {
    const tools = toolsForScope("tasks:read tasks:write");
    expect(tools.map((t) => t.name)).toContain("add_task");
  });

  test("add_task invisible sans tasks:write", () => {
    const tools = toolsForScope("tasks:read");
    expect(tools.map((t) => t.name)).not.toContain("add_task");
  });
});

describe("add_task parseArgs", () => {
  test("refuse un titre absent", () => {
    const def = findTool("add_task")!;
    const res = def.parseArgs({});
    expect(res).toEqual({ error: "title est requis (string)." });
  });

  test("refuse un titre non-string", () => {
    const def = findTool("add_task")!;
    const res = def.parseArgs({ title: 42 });
    expect(res).toEqual({ error: "title est requis (string)." });
  });
});
