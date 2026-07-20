import { describe, expect, test } from "vitest";
import { sanitizeTranscript } from "./speech";

describe("sanitizeTranscript (US-02)", () => {
  test("trim les espaces en début/fin", () => {
    expect(sanitizeTranscript("  acheter du pain  ")).toBe("acheter du pain");
  });

  test("réduit les espaces multiples", () => {
    expect(sanitizeTranscript("acheter   du    pain")).toBe("acheter du pain");
  });

  test("retire un point final auto-ajouté par le moteur", () => {
    expect(sanitizeTranscript("acheter du pain.")).toBe("acheter du pain");
  });

  test("tronque à 140 caractères", () => {
    const long = "a".repeat(200);
    expect(sanitizeTranscript(long)).toHaveLength(140);
  });

  test("chaîne vide reste vide", () => {
    expect(sanitizeTranscript("")).toBe("");
  });
});
