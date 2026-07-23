import { createHash, randomBytes } from "node:crypto";

// US-22 : jeton opaque haute entropie (256 bits, hex) - reutilise pour code
// d'autorisation, access_token, refresh_token (RFC 6749). Seul le hash
// SHA-256 est stocke en base (jamais en clair), meme principe que
// lib/webhook-token.ts (US-03).
export function generateOpaqueToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// 60s, usage unique (design). Suffisant pour un aller-retour navigateur
// immediat entre /oauth/authorize et /oauth/token.
export const AUTHORIZATION_CODE_TTL_MS = 60_000;

// 1h - jeton court, renouvelable via grant refresh_token sans nouvel ecran
// de consentement.
export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;

export function expiresAtFromNow(ttlMs: number, now: Date = new Date()): string {
  return new Date(now.getTime() + ttlMs).toISOString();
}

// Limite inclusive : expire pile a l'instant d'expiration (pas une
// microseconde apres), pour ne jamais laisser passer un jeton dont le TTL
// vient tout juste de s'ecouler.
export function isExpired(expiresAtIso: string, now: Date = new Date()): boolean {
  return new Date(expiresAtIso).getTime() <= now.getTime();
}
