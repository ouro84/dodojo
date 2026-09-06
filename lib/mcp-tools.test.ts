import { describe, expect, test } from "vitest";
import { findTool, toolsForScope, TOOL_REGISTRY } from "./mcp-tools";

describe("TOOL_REGISTRY", () => {
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
    expect(res).toEqual({ ok: false, error: "title est requis (string)." });
  });

  test("refuse un titre non-string", () => {
    const def = findTool("add_task")!;
    const res = def.parseArgs({ title: 42 });
    expect(res).toEqual({ ok: false, error: "title est requis (string)." });
  });
});

describe("catalogue de lecture (lot 3)", () => {
  test("les 6 tools attendus sont enregistres", () => {
    expect(TOOL_REGISTRY.map((t) => t.tool.name).sort()).toEqual(
      ["add_task", "get_boss_status", "get_progression", "get_streak", "list_heroes", "list_tasks"].sort(),
    );
  });

  test("les scopes requis sont corrects", () => {
    const scopeOf = (name: string) => findTool(name)?.requiredScope;
    expect(scopeOf("list_tasks")).toBe("tasks:read");
    expect(scopeOf("get_boss_status")).toBe("tasks:read");
    expect(scopeOf("get_streak")).toBe("tasks:read");
    expect(scopeOf("get_progression")).toBe("profile:read");
    expect(scopeOf("list_heroes")).toBe("profile:read");
  });

  test("un token tasks:read seul ne voit aucun tool d'ecriture", () => {
    const names = toolsForScope("tasks:read").map((t) => t.name);
    expect(names).toContain("list_tasks");
    expect(names).not.toContain("add_task");
  });

  test("un token profile:read seul ne voit que les tools de profil", () => {
    const names = toolsForScope("profile:read").map((t) => t.name).sort();
    expect(names).toEqual(["get_progression", "list_heroes"]);
  });

  test("list_tasks refuse un argument day invalide", () => {
    const parsed = findTool("list_tasks")!.parseArgs({ day: "hier" });
    expect(parsed.ok).toBe(false);
  });

  test("list_tasks accepte l'absence d'arguments", () => {
    const parsed = findTool("list_tasks")!.parseArgs({});
    expect(parsed.ok).toBe(true);
  });

  test("les tools sans argument acceptent un objet vide", () => {
    for (const name of ["get_boss_status", "get_streak", "get_progression", "list_heroes"]) {
      expect(findTool(name)!.parseArgs({}).ok).toBe(true);
    }
  });
});
