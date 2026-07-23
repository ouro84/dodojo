import { describe, expect, test } from "vitest";
import { deriveCodeChallenge, generateCodeVerifier, verifyCodeChallenge } from "./pkce";

describe("generateCodeVerifier (US-22 - RFC 7636)", () => {
  test("genere 43 caracteres dans l'alphabet non reserve (base64url)", () => {
    expect(generateCodeVerifier()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  test("deux appels generent des verifiers differents", () => {
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier());
  });
});

describe("deriveCodeChallenge (S256)", () => {
  test("vecteur de test officiel RFC 7636 Appendix B.1", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(deriveCodeChallenge(verifier)).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  test("deterministe : meme verifier -> meme challenge", () => {
    const verifier = generateCodeVerifier();
    expect(deriveCodeChallenge(verifier)).toBe(deriveCodeChallenge(verifier));
  });

  test("deux verifiers differents -> challenges differents", () => {
    expect(deriveCodeChallenge(generateCodeVerifier())).not.toBe(deriveCodeChallenge(generateCodeVerifier()));
  });
});

describe("verifyCodeChallenge", () => {
  test("verifier correct contre son challenge -> true", () => {
    const verifier = generateCodeVerifier();
    const challenge = deriveCodeChallenge(verifier);
    expect(verifyCodeChallenge(verifier, challenge)).toBe(true);
  });

  test("mauvais verifier contre le challenge -> false", () => {
    const challenge = deriveCodeChallenge(generateCodeVerifier());
    expect(verifyCodeChallenge(generateCodeVerifier(), challenge)).toBe(false);
  });
});
