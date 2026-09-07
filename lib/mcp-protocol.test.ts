import { describe, expect, test } from "vitest";
import {
  buildAddTaskToolResult,
  buildInitializeResult,
  buildToolErrorResult,
  errorResponse,
  parseJsonRpcRequest,
  successResponse,
} from "./mcp-protocol";

describe("parseJsonRpcRequest (US-22)", () => {
  test("accepte une requete JSON-RPC 2.0 valide avec params", () => {
    const parsed = parseJsonRpcRequest({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { a: 1 } });
    expect(parsed).toEqual({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { a: 1 } });
  });

  test("accepte une notification sans id (id -> null)", () => {
    const parsed = parseJsonRpcRequest({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(parsed?.id).toBeNull();
  });

  test("rejette un corps sans jsonrpc 2.0", () => {
    expect(parseJsonRpcRequest({ method: "tools/list" })).toBeNull();
  });

  test("rejette un corps sans method", () => {
    expect(parseJsonRpcRequest({ jsonrpc: "2.0" })).toBeNull();
  });

  test("rejette un id d'un type invalide", () => {
    expect(parseJsonRpcRequest({ jsonrpc: "2.0", id: {}, method: "tools/list" })).toBeNull();
  });

  test("rejette un body qui n'est pas un objet", () => {
    expect(parseJsonRpcRequest("pas un objet")).toBeNull();
    expect(parseJsonRpcRequest(null)).toBeNull();
  });
});

describe("buildInitializeResult", () => {
  test("initialize expose une version de protocole et les capacites tools", () => {
    const result = buildInitializeResult() as { capabilities: unknown; protocolVersion: unknown };
    expect(result.capabilities).toEqual({ tools: {} });
    expect(typeof result.protocolVersion).toBe("string");
  });
});

describe("buildAddTaskToolResult / buildToolErrorResult", () => {
  test("formate un resultat de succes avec les HP du Boss", () => {
    const result = buildAddTaskToolResult({ taskId: "t1", dayDate: "2026-07-22", bossMaxHp: 40, bossCurrentHp: 20 });
    expect(result.isError).toBe(false);
    expect(result.content).toEqual([
      { type: "text", text: "Tache ajoutee (id t1) pour le 2026-07-22. Boss a 20/40 HP." },
    ]);
  });

  // BLOCKING 2 (issue #201, lot 4 revue) : une tache creee pour demain
  // (day: "tomorrow") ne doit jamais afficher un "Boss a X/Y HP" non
  // qualifie — insertTaskForUser calcule ces HP a partir des taches de
  // DEMAIN (lib/task-insertion.ts), jamais du Boss du jour courant (CLAUDE.md
  // : une tache de demain ne peut jamais affecter le Boss d'aujourd'hui). Un
  // agent qui relaie ce texte tel quel au joueur mentirait sur l'etat reel du
  // Boss du jour.
  test("formate un resultat de succes pour demain avec un Boss explicitement qualifie", () => {
    const result = buildAddTaskToolResult(
      { taskId: "t1", dayDate: "2026-07-23", bossMaxHp: 20, bossCurrentHp: 20 },
      true,
    );
    expect(result.isError).toBe(false);
    expect(result.content).toEqual([
      { type: "text", text: "Tache ajoutee (id t1) pour le 2026-07-23. Boss de demain a 20/20 HP." },
    ]);
  });

  test("formate un resultat d'erreur outil", () => {
    const result = buildToolErrorResult("Nomme ton monstre avant de l'invoquer.");
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: "text", text: "Nomme ton monstre avant de l'invoquer." }]);
  });
});

describe("successResponse / errorResponse", () => {
  test("enveloppe un resultat en reponse JSON-RPC 2.0", () => {
    expect(successResponse(1, { ok: true })).toEqual({ jsonrpc: "2.0", id: 1, result: { ok: true } });
  });

  test("enveloppe une erreur en reponse JSON-RPC 2.0", () => {
    expect(errorResponse(1, -32601, "Methode inconnue")).toEqual({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32601, message: "Methode inconnue" },
    });
  });
});
