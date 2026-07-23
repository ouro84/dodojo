import { describe, expect, test } from "vitest";
import { createRateLimiter, extractClientIp } from "./rate-limit";

describe("createRateLimiter (US-22 - protection basique par IP)", () => {
  test("autorise jusqu'a la limite dans la fenetre", () => {
    const limiter = createRateLimiter(3, 1000);
    expect(limiter.consume("ip-a", 0).allowed).toBe(true);
    expect(limiter.consume("ip-a", 100).allowed).toBe(true);
    expect(limiter.consume("ip-a", 200).allowed).toBe(true);
  });

  test("bloque la requete au-dela de la limite dans la meme fenetre", () => {
    const limiter = createRateLimiter(2, 1000);
    limiter.consume("ip-b", 0);
    limiter.consume("ip-b", 100);
    const result = limiter.consume("ip-b", 200);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  test("la fenetre glisse : une requete hors fenetre redevient autorisee", () => {
    const limiter = createRateLimiter(1, 1000);
    limiter.consume("ip-c", 0);
    expect(limiter.consume("ip-c", 500).allowed).toBe(false);
    expect(limiter.consume("ip-c", 1001).allowed).toBe(true);
  });

  test("deux cles (IP) differentes sont comptees independamment", () => {
    const limiter = createRateLimiter(1, 1000);
    expect(limiter.consume("ip-d", 0).allowed).toBe(true);
    expect(limiter.consume("ip-e", 0).allowed).toBe(true);
  });
});

describe("extractClientIp", () => {
  test("retourne la premiere IP de x-forwarded-for", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "203.0.113.4, 10.0.0.1" },
    });
    expect(extractClientIp(request)).toBe("203.0.113.4");
  });

  test("retire les espaces autour de l'IP", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "  203.0.113.4  ,10.0.0.1" },
    });
    expect(extractClientIp(request)).toBe("203.0.113.4");
  });

  test("header absent -> \"unknown\"", () => {
    const request = new Request("http://localhost");
    expect(extractClientIp(request)).toBe("unknown");
  });
});
