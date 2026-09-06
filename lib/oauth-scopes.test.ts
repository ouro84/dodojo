import { describe, expect, test } from "vitest";
import { ALL_SCOPES, DEFAULT_SCOPE, hasScope, parseScopeString } from "./oauth-scopes";

describe("parseScopeString", () => {
  test("accepte les 4 scopes connus, espace-separes", () => {
    const res = parseScopeString("tasks:read tasks:write");
    expect(res).toEqual(["tasks:read", "tasks:write"]);
  });

  test("refuse un scope inconnu, jamais un filtrage silencieux", () => {
    const res = parseScopeString("tasks:read admin:everything");
    expect(res).toEqual({ error: "Portee inconnue : admin:everything" });
  });

  test("chaine vide -> tableau vide (l'appelant decide du defaut)", () => {
    expect(parseScopeString("")).toEqual([]);
  });

  test("espaces multiples ignores", () => {
    const res = parseScopeString("tasks:read  tasks:write");
    expect(res).toEqual(["tasks:read", "tasks:write"]);
  });
});

describe("hasScope", () => {
  test("scope accorde -> true", () => {
    expect(hasScope("tasks:read tasks:write", "tasks:read")).toBe(true);
  });

  test("scope non accorde -> false", () => {
    expect(hasScope("tasks:read tasks:write", "profile:write")).toBe(false);
  });

  test("DEFAULT_SCOPE n'accorde jamais profile:write", () => {
    expect(hasScope(DEFAULT_SCOPE, "profile:write")).toBe(false);
  });
});

test("ALL_SCOPES contient exactement les 4 scopes du spec D2", () => {
  expect([...ALL_SCOPES].sort()).toEqual(
    ["profile:read", "profile:write", "tasks:read", "tasks:write"].sort(),
  );
});
