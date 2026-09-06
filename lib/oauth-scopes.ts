export type OAuthScope = "tasks:read" | "tasks:write" | "profile:read" | "profile:write";

export const ALL_SCOPES: readonly OAuthScope[] = [
  "tasks:read",
  "tasks:write",
  "profile:read",
  "profile:write",
];

// D2 du spec : une requete /oauth/authorize sans parametre scope accorde ces
// deux-la, JAMAIS profile:write - un client qui ne demande rien n'obtient pas
// le droit de modifier l'equipement.
export const DEFAULT_SCOPE = "tasks:read tasks:write";

function isKnownScope(value: string): value is OAuthScope {
  return (ALL_SCOPES as readonly string[]).includes(value);
}

// Scope inconnu -> refus explicite, jamais un filtrage silencieux (D2) : un
// client qui croit avoir obtenu un droit qu'il n'a pas produit des erreurs
// incomprehensibles plus tard.
export function parseScopeString(raw: string): OAuthScope[] | { error: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return [];
  const tokens = trimmed.split(/\s+/);
  for (const token of tokens) {
    if (!isKnownScope(token)) {
      return { error: `Portee inconnue : ${token}` };
    }
  }
  return tokens as OAuthScope[];
}

export function hasScope(grantedScope: string, required: OAuthScope): boolean {
  const parsed = parseScopeString(grantedScope);
  if ("error" in parsed) return false;
  return parsed.includes(required);
}
