import { describe, expect, test } from "vitest";
import { resolveAggressivityLevel } from "./aggressivity";

describe("resolveAggressivityLevel", () => {
  test("renvoie la valeur telle quelle si elle est définie", () => {
    expect(resolveAggressivityLevel("sensei")).toBe("sensei");
    expect(resolveAggressivityLevel("sparring")).toBe("sparring");
    expect(resolveAggressivityLevel("street")).toBe("street");
  });

  test("replie sur sparring si null (profil pré-migration US-49/US-54)", () => {
    expect(resolveAggressivityLevel(null)).toBe("sparring");
  });

  test("replie sur sparring si undefined", () => {
    expect(resolveAggressivityLevel(undefined)).toBe("sparring");
  });
});
