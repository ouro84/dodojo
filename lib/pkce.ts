import { createHash, randomBytes } from "node:crypto";

// RFC 7636 (PKCE) : code_verifier = chaine haute entropie [A-Za-z0-9-._~],
// 43 a 128 caracteres. 32 octets aleatoires encodes en base64url produisent
// exactement 43 caracteres, tous dans l'alphabet autorise (base64url est un
// sous-ensemble des caracteres "unreserved" RFC 3986 moins '~', jamais
// utilise par Node ici) - sans padding.
export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

// S256 uniquement (seule methode acceptee par ce serveur, cf.
// code_challenge_methods_supported du RFC 8414) : BASE64URL(SHA256(verifier)).
export function deriveCodeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

export function verifyCodeChallenge(codeVerifier: string, expectedChallenge: string): boolean {
  return deriveCodeChallenge(codeVerifier) === expectedChallenge;
}
