import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

// 256 bits, hex-encodé → 64 caractères. Import relatif volontaire (node:crypto
// mis à part) : ce fichier est chargé directement par Vitest (voir Global
// Constraints, pas d'alias @/ dans les fichiers testés).
export const WEBHOOK_TOKEN_BYTES = 32;

// US-03 : token webhook personnel affiché en clair UNE seule fois côté QG
// (voir app/actions/webhook-token.ts) — jamais stocké tel quel, seul son hash
// SHA-256 est persisté (hashWebhookToken).
export function generateWebhookToken(): string {
  return randomBytes(WEBHOOK_TOKEN_BYTES).toString("hex");
}

// SHA-256 hex — suffisant pour un secret à haute entropie généré
// aléatoirement (≠ mot de passe utilisateur à faible entropie, qui
// nécessiterait bcrypt/argon2 avec sel).
export function hashWebhookToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Comparaison en temps constant : évite qu'un attaquant mesure la latence
// pour deviner le hash caractère par caractère. `storedHash` peut être
// absent (aucun token généré) ou malformé → toujours invalide, jamais de
// throw (timingSafeEqual lève si les deux Buffers n'ont pas la même
// longueur, d'où la vérification de longueur avant l'appel).
export function verifyWebhookToken(
  token: string,
  storedHash: string | null | undefined,
): boolean {
  if (!token || !storedHash) return false;
  const candidate = Buffer.from(hashWebhookToken(token), "hex");
  const stored = Buffer.from(storedHash, "hex");
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}
