import { describe, expect, test } from "vitest";
import { resolveBuildRevision } from "./build-revision";

describe("resolveBuildRevision (socle PWA — invalidation du precache par build)", () => {
  test("priorise le SHA fourni par Vercel s'il existe", () => {
    expect(resolveBuildRevision("abc123", () => "should-not-be-used")).toBe("abc123");
  });

  test("retombe sur le SHA git local si Vercel est absent", () => {
    expect(resolveBuildRevision(undefined, () => "local-sha")).toBe("local-sha");
  });

  test("génère un identifiant aléatoire si ni Vercel ni git ne répondent", () => {
    const result = resolveBuildRevision(undefined, () => null);
    expect(result).toMatch(/^[0-9a-f-]{36}$/);
  });
});
